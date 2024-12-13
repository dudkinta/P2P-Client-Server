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
import {
  Delegator,
  selectDelegates,
  REQUIRE_DELEGATE_COUNT,
} from "../delegator/delegator.js";
import { LogLevel } from "../network/helpers/log-level.js";
import { sendDebug } from "./../network/services/socket-service.js";
import pkg from "debug";
import { AllowedTypes } from "./db-context/models/common.js";
const { debug } = pkg;

const TOTAL_COINS: number = 1000000000; // Общее количество монет (1 миллиард)
const INVEST_PERCENT: number = 0.16; // Процент инвесторов (16%)
const TOTAL_YEARS: number = 50; // Общее количество лет (50 лет)
const BLOCK_INTERVAL: number = 60; // Интервал между блоками в секундах (5 секунд)
const HALVINGS: number = 16; // Количество халвингов (16)

export class BlockChain extends EventEmitter {
  private static instance: BlockChain;
  private delegator?: Delegator;
  private db: dbContext;
  private chain: Block[] = [];
  private pendingTransactions: Transaction[] = [];
  private pendingSmartContracts: SmartContract[] = [];
  private pendingContractTransactions: ContractTransaction[] = [];
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

  public getDelegator(): Delegator | undefined {
    return this.delegator;
  }
  public async startAsync(delegator: Delegator): Promise<void> {
    this.delegator = delegator;
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
    this.headIndex =
      this.chain.length == 0
        ? -1
        : Math.max(...this.chain.map((block) => block.index));
    this.log(LogLevel.Info, "Blockchain initialized.");
  }

  public getChain(): Block[] {
    return this.chain;
  }

  public async addBlock(block: Block, isFillChain: boolean): Promise<void> {
    const existBlock = await this.getBlock(block.index);
    if (existBlock) {
      if (existBlock.hash === block.hash) {
        return;
      } else {
        let existRewartIndexReceiver: number = 999;
        if (existBlock.reward.receiver) {
          existRewartIndexReceiver = existBlock.selectedDelegates.indexOf(
            existBlock.reward.receiver
          );
        }
        let currentRewartIndexReceiver: number = 999;
        if (block.reward.receiver) {
          currentRewartIndexReceiver = block.selectedDelegates.indexOf(
            block.reward.receiver
          );
        }
        if (existRewartIndexReceiver > currentRewartIndexReceiver) {
          await this.replaceBlock(existBlock, block, isFillChain);
        }
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
      !isFillChain &&
      Wallet.current &&
      Wallet.current.publicKey &&
      block.selectedDelegates.includes(Wallet.current.publicKey)
    ) {
      setTimeout(async () => {
        this.createBlock();
      }, BLOCK_INTERVAL * 1000);
    }
    this.log(
      LogLevel.Info,
      `Block added: ${block.index} reward:${block.reward.amount}`
    );
    await this.db.blockStorage.save(block);
    if (this.headIndex < block.index) {
      this.headIndex = block.index;
    };
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
    blockNumber: number // Номер блока, для которого рассчитывается вознаграждение
  ): number {
    // Количество блоков в год
    const blocksPerYear = Math.floor((365 * 24 * 60 * 60) / BLOCK_INTERVAL);

    // Общее количество блоков за весь период
    const totalBlocks = blocksPerYear * TOTAL_YEARS;

    // Количество блоков на один этап (до следующего халвинга)
    const blocksPerStage = totalBlocks / HALVINGS;

    // Общая эмиссия после вычета 16% для нулевого блока
    const remainingCoins = TOTAL_COINS * (1 - INVEST_PERCENT);

    // Начальное вознаграждение для остальных блоков
    const initialReward =
      remainingCoins /
      ((blocksPerStage * (1 - Math.pow(0.5, HALVINGS))) / (1 - 0.5));

    // Если это нулевой блок, то возвращаем 16% от всей эмиссии
    if (blockNumber === 0) {
      return TOTAL_COINS * INVEST_PERCENT;
    }

    // Определяем текущий этап (номер халвинга)
    const currentStage = Math.floor(blockNumber / blocksPerStage);

    // Вознаграждение за блок в текущем этапе
    const reward = initialReward / Math.pow(2, currentStage);

    return reward;
  }

  public async addBlockchainData(message: MessageChain): Promise<void> {
    this.log(LogLevel.Info, `Receive blockchaindata: ${message}`);
    if (message.type === MessageType.BLOCK) {
      const block = message.value as Block;
      if (block.isValid()) {
        const lastBlock = await this.getLastBlock();
        if (!lastBlock && block.index === 0) {
          await this.addBlock(block, false);
          return;
        }
        if (
          lastBlock &&
          block.previousHash === lastBlock.hash &&
          block.index === lastBlock.index + 1
        ) {
          await this.addBlock(block, false);
        }
        if (!lastBlock && block.index !== 0) {
          //ignore block/ need to request missing blocks
        }
        if (lastBlock && lastBlock.index + 1 !== block.index) {
          //ignore block/ need to request missing blocks
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
        }, '');
        this.emit("message:chain", messageChain);
      }
    }
    if (message.type == MessageType.CHAIN) {
      const messageValue = message.value as BlockChainMessage;
      const key = messageValue.key;
      const maxIndex = messageValue.maxIndex;
      const block = messageValue.block;
      if (!Wallet.current) {
        this.log(LogLevel.Error, "Current wallet is null");
        return;
      }
      if (!Wallet.current.publicKey) {
        this.log(LogLevel.Error, "Publick key is null");
        return;
      }
      const verify = crypto.createVerify("SHA256");
      verify.update(`${block.index}`).end();
      const isSignatureValid = verify.verify(
        Wallet.current.publicKey,
        key,
        "hex"
      );
      if (!isSignatureValid) {
        this.log(LogLevel.Error, "Invalid signature for chain message.");
        return;
      }

      if (block.isValid()) {
        const index = block.index;
        if (block.index === 0) {
          await this.addBlock(block, true);
          return;
        }
        const lastBlock = await this.getBlock(index - 1);
        if (lastBlock && lastBlock.hash === block.previousHash) {
          await this.addBlock(block, true);
        }
      }
    }
    if (message.type == MessageType.HEAD_BLOCK_INDEX) {
      const receiveHeadIndex = message.value as number;
      if (receiveHeadIndex > this.headIndex) {
        this.headIndex = receiveHeadIndex;
      }
    }
  }

  public async createBlock(): Promise<void> {
    const lastBlock = await this.getLastBlock();
    if (!this.delegator) {
      this.log(LogLevel.Error, "Delegator is not initialized.");
      return;
    }
    const dtNow = Date.now();
    const neighbors = this.delegator.walletDelegates.map(
      (delegate) => delegate.publicKey
    );
    const selectedDelegates = selectDelegates(
      lastBlock?.hash ?? "0",
      dtNow,
      neighbors
    );
    if (selectedDelegates.length != REQUIRE_DELEGATE_COUNT) {
      this.log(LogLevel.Error, "Delegates are not selected.");
      return;
    }
    if (!Wallet.current) {
      this.log(LogLevel.Error, "Current wallet is null");
      return;
    }
    if (!Wallet.current.publicKey) {
      this.log(LogLevel.Error, "Public key is null");
      return;
    }
    const rewardTransaction = new Transaction(
      Wallet.current.publicKey,
      Wallet.current.publicKey,
      this.calculateBlockReward(lastBlock?.index ?? 0),
      AllowedTypes.REWART,
      dtNow
    );
    Wallet.current.signTransaction(rewardTransaction);
    if (!lastBlock) {
      const genesisBlock = new Block(
        0,
        "0",
        dtNow,
        rewardTransaction,
        this.pendingTransactions,
        this.pendingSmartContracts,
        this.pendingContractTransactions,
        neighbors,
        selectedDelegates
      );
      //console.log("block", genesisBlock);
      await this.addBlock(genesisBlock, false);
      this.emit(
        "message:newBlock",
        new MessageChain(MessageType.BLOCK, genesisBlock, '')
      );
    } else {
      const block = new Block(
        lastBlock.index + 1,
        lastBlock.hash,
        dtNow,
        rewardTransaction,
        this.pendingTransactions,
        this.pendingSmartContracts,
        this.pendingContractTransactions,
        neighbors,
        selectedDelegates
      );
      this.pendingTransactions = [];
      this.pendingSmartContracts = [];
      this.pendingContractTransactions = [];
      //console.log("block", block);
      await this.addBlock(block, false);
      this.emit("message:newBlock", new MessageChain(MessageType.BLOCK, block, ''));
    }
  }

  private async replaceBlock(
    oldBlock: Block,
    newBlock: Block,
    isFillChain: boolean
  ): Promise<void> {
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
    await this.addBlock(newBlock, isFillChain);
  }

  public getHeadIndex(): number {
    return this.headIndex;
  }
}
