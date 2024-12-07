import crypto from "crypto";
import { dbContext } from "./db-context/database.js";
import { Block } from "./db-context/models/block.js";
import { SmartContract } from "./db-context/models/smart-contract.js";
import { Transaction } from "./db-context/models/transaction.js";
import { ContractTransaction } from "./db-context/models/contract-transaction.js";
import { EventEmitter } from "events";
import {
  MessageChain,
  MessageType,
  BlockChainMessage,
  MessageRequest,
} from "./../network/services/messages/index.js";
import { Wallet } from "./../wallet/wallet.js";
import { Validator, REQUIRE_VALIDATOR_COUNT } from "../validator/validator.js";
import { LogLevel } from "../network/helpers/log-level.js";
import { sendDebug } from "./../network/services/socket-service.js";
import pkg from "debug";
const { debug } = pkg;

export class BlockChain extends EventEmitter {
  private static instance: BlockChain;
  private validator?: Validator;
  private db: dbContext;
  private chain: Block[] = [];
  private pendingTransactions: Transaction[] = [];
  private pendingSmartContracts: SmartContract[] = [];
  private pendingContractTransactions: ContractTransaction[] = [];
  private requestsChain: MessageChain[] = [];
  private headIndex: number = 0;
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("blockchain", level, timestamp, message);
    debug("blockchain")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };

  private constructor() {
    super();
    this.db = new dbContext();
  }

  public static getInstance(): BlockChain {
    if (!BlockChain.instance) {
      BlockChain.instance = new BlockChain();
    }
    return BlockChain.instance;
  }

  public async initAsync(validator: Validator): Promise<void> {
    this.validator = validator;
    this.chain = await this.db.blockStorage.getAll();
    this.chain.sort((a, b) => a.index - b.index);
    let lastBlock: Block;
    let errorIndex: number | undefined = undefined;
    this.chain.forEach((block) => {
      if (!lastBlock) {
        lastBlock = block;
        return;
      }
      if (block.previousHash !== lastBlock.hash) {
        if (!errorIndex) {
          errorIndex = block.index;
        }
      }
      lastBlock = block;
    });
    if (errorIndex) {
      const firstErorBlock = await this.getBlock(errorIndex);
      if (firstErorBlock) {
        this.chain = this.chain.filter((b) => b.index < firstErorBlock.index);
        await this.db.blockStorage.delete(errorIndex);
      }
    }
    const maxIndex = Math.max(...this.chain.map((block) => block.index));
    this.emit("store:putHeadBlock", maxIndex);
    this.log(LogLevel.Info, "Blockchain initialized.");
  }

  public getChain(): Block[] {
    return this.chain;
  }

  public async addBlock(block: Block): Promise<void> {
    const existBlock = await this.getBlock(block.index);
    if (existBlock) {
      if (existBlock.hash === block.hash) {
        return;
      } else {
        await this.replaceBlock(existBlock, block);
        return;
      }
    }
    this.chain.push(block);
    this.pendingTransactions = this.pendingTransactions.filter(
      (transaction) =>
        !block.transactions.some(
          (processedTransaction) =>
            processedTransaction.hash === transaction.hash
        )
    );
    this.pendingSmartContracts = this.pendingSmartContracts.filter(
      (contract) =>
        !block.smartContracts.some(
          (processedContract) => processedContract.hash === contract.hash
        )
    );
    this.pendingContractTransactions = this.pendingContractTransactions.filter(
      (transaction) =>
        !block.contractTransactions.some(
          (processedTransaction) =>
            processedTransaction.hash === transaction.hash
        )
    );
    if (
      Wallet.current &&
      Wallet.current.publicKey &&
      block.validators.includes(Wallet.current.publicKey)
    ) {
      setTimeout(async () => {
        this.createBlock();
      }, 60 * 1000);
    }
    await this.db.blockStorage.save(block);
    this.headIndex = block.index;
    this.emit("store:putHeadBlock", block.index);
  }

  public async getLastBlock(): Promise<Block | undefined> {
    return await this.getBlock(this.chain.length - 1);
  }

  public async getBlock(index: number): Promise<Block | undefined> {
    const block = this.chain.find((b) => b.index === index);
    if (block) return block;
    return await this.db.blockStorage.get(index);
  }

  public async getBlocksInRange(start: number, end: number): Promise<Block[]> {
    return await this.db.blockStorage.getByRange(start, end);
  }

  public calculateBlockReward(
    totalCoins: number, // Общее количество монет (1 миллиард)
    totalYears: number, // Общее количество лет (50 лет)
    blockInterval: number, // Интервал между блоками в секундах (5 секунд)
    halvings: number, // Количество халвингов (16)
    blockNumber: number // Номер блока, для которого рассчитывается вознаграждение
  ): number {
    // Количество блоков в год
    const blocksPerYear = Math.floor((365 * 24 * 60 * 60) / blockInterval);

    // Общее количество блоков за весь период
    const totalBlocks = blocksPerYear * totalYears;

    // Количество блоков на один этап (до следующего халвинга)
    const blocksPerStage = totalBlocks / halvings;

    // Начальное вознаграждение
    const initialReward =
      totalCoins /
      ((blocksPerStage * (1 - Math.pow(0.5, halvings))) / (1 - 0.5));

    // Определяем текущий этап (номер халвинга)
    const currentStage = Math.floor(blockNumber / blocksPerStage);

    // Вознаграждение за блок в текущем этапе
    const reward = initialReward / Math.pow(2, currentStage);

    return reward;
  }

  public async addBlockchainData(message: MessageChain): Promise<void> {
    if (message.type === MessageType.BLOCK) {
      const block = message.value as Block;
      if (block.isValid()) {
        const lastBlock = await this.getLastBlock();
        if (!lastBlock && block.index === 0) {
          await this.addBlock(block);
          return;
        }
        if (
          lastBlock &&
          block.previousHash === lastBlock.hash &&
          block.index === lastBlock.index + 1
        ) {
          await this.addBlock(block);
        }
        if (!lastBlock && block.index !== 0) {
          //ignore block/ need to request missing blocks
          /*const requestBlock = new MessageChain(MessageType.REQUEST_CHAIN, {
            start: 0,
            end: block.index,
            key: crypto
              .createHash("sha256")
              .update(`${0}:${block.index}:${Date.now()}`)
              .digest("hex"),
          });
          requestBlock.sender = message.sender;
          this.requestsChain.push(requestBlock);
          this.emit("message:request", requestBlock);*/
        }
        if (lastBlock && lastBlock.index + 1 !== block.index) {
          //ignore block/ need to request missing blocks
          /*const requestBlock = new MessageChain(MessageType.REQUEST_CHAIN, {
            start: lastBlock.index + 1,
            end: block.index,
            key: crypto
              .createHash("sha256")
              .update(`${lastBlock.index + 1}:${block.index}:${Date.now()}`)
              .digest("hex"),
          });
          requestBlock.sender = message.sender;
          this.requestsChain.push(requestBlock);
          this.emit("message:request", requestBlock);*/
        }
      }
    }
    if (message.type === MessageType.TRANSACTION) {
      const transaction = message.value as Transaction;
      if (transaction.isValid()) {
        this.pendingTransactions.push(transaction);
      }
    }
    if (message.type === MessageType.SMART_CONTRACT) {
      const contract = message.value as SmartContract;
      if (contract.isValid()) {
        this.pendingSmartContracts.push(contract);
      }
    }
    if (message.type === MessageType.CONTRACT_TRANSACTION) {
      const contract_transaction = message.value as ContractTransaction;
      if (contract_transaction.isValid()) {
        this.pendingContractTransactions.push(contract_transaction);
      }
    }
    if (message.type == MessageType.REQUEST_CHAIN) {
      const messageValue = message.value as MessageRequest;
      const key = messageValue.key;
      const index = messageValue.index;
      const block = await this.getBlock(index);
      if (block) {
        const messageChain = new MessageChain(MessageType.CHAIN, {
          key: key,
          maxIndex: this.chain.length - 1,
          block: block,
        });
        messageChain.sender = message.sender;
        this.emit("message:chain", messageChain);
      }
    }
    if (message.type == MessageType.CHAIN) {
      const messageValue = message.value as BlockChainMessage;
      const key = messageValue.key;
      const maxIndex = messageValue.maxIndex;
      const request = this.requestsChain.find(
        (r) => (r.value as MessageRequest).key === key
      );
      if (request) {
        this.requestsChain = this.requestsChain.filter(
          (r) => (r.value as MessageRequest).key !== key
        );
      } else {
        return;
      }
      const block = messageValue.block;
      if (block.isValid()) {
        const index = block.index;
        if (block.index === 0) {
          await this.addBlock(block);
          return;
        }
        const lastBlock = await this.getBlock(index - 1);
        if (lastBlock && lastBlock.hash === block.previousHash) {
          await this.addBlock(block);
          if (index < maxIndex) {
            this.setHeadIndex(index + 1);
          }
        }
      }
    }
  }

  private async createBlock(): Promise<void> {
    const lastBlock = await this.getLastBlock();
    if (!this.validator) {
      throw new Error("Validator is not initialized.");
    }
    const validators = this.validator.selectValidators();
    if (validators.length != REQUIRE_VALIDATOR_COUNT) {
      throw new Error("Validators are not selected.");
    }
    if (!lastBlock) {
      const genesisBlock = new Block(
        0,
        "0",
        Date.now(),
        [],
        [],
        [],
        this.validator.selectValidators()
      );
      await this.addBlock(genesisBlock);
    } else {
      const block = new Block(
        lastBlock.index + 1,
        lastBlock.hash,
        Date.now(),
        this.pendingTransactions,
        this.pendingSmartContracts,
        this.pendingContractTransactions
      );
      this.pendingTransactions = [];
      this.pendingSmartContracts = [];
      this.pendingContractTransactions = [];
      await this.addBlock(block);
      this.emit("message:newBlock", new MessageChain(MessageType.BLOCK, block));
    }
  }

  private async replaceBlock(oldBlock: Block, newBlock: Block): Promise<void> {
    oldBlock.transactions.forEach(async (transaction) => {
      this.pendingTransactions.push(transaction);
    });
    oldBlock.smartContracts.forEach(async (contract) => {
      this.pendingSmartContracts.push(contract);
    });
    oldBlock.contractTransactions.forEach(async (transaction) => {
      this.pendingContractTransactions.push(transaction);
    });
    this.chain = this.chain.filter((b) => b.hash !== oldBlock.hash);
    this.db.blockStorage.delete(oldBlock.index);
    await this.addBlock(newBlock);
  }

  public setHeadIndex(index: number): void {
    if (index > this.headIndex) {
      const requestIndex = this.headIndex + 1;
      const requestBlock = new MessageChain(MessageType.REQUEST_CHAIN, {
        index: requestIndex,
        key: crypto
          .createHash("sha256")
          .update(`${requestIndex}:${Date.now()}`)
          .digest("hex"),
      });
      this.requestsChain.push(requestBlock);
      this.emit("message:request", requestBlock);
    }
  }
}
