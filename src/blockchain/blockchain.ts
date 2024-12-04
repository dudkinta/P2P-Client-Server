import { dbContext } from "./db-context/database.js";
import { Block } from "./db-context/models/block.js";
import { SmartContract } from "./db-context/models/smart-contract.js";
import { Transaction } from "./db-context/models/transaction.js";
import { ContractTransaction } from "./db-context/models/contract-transaction.js";
import { EventEmitter } from "events";
import {
  MessageChain,
  MessageType,
} from "./../network/services/messages/index.js";
import { Wallet } from "./../wallet/wallet.js";
import { Validator, REQUIRE_VALIDATOR_COUNT } from "../validator/validator.js";

export class BlockChain extends EventEmitter {
  private static instance: BlockChain;
  private validator?: Validator;
  private db: dbContext;
  private chain: Block[] = [];
  private pendingTransactions: Transaction[] = [];
  private pendingSmartContracts: SmartContract[] = [];
  private pendingContractTransactions: ContractTransaction[] = [];
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
  }

  public getChain(): Block[] {
    return this.chain;
  }

  public addBlock(block: Block): void {
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
    this.db.blockStorage.save(block);
  }

  public getLastBlock(): Block | undefined {
    return this.chain[this.chain.length - 1];
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
        this.addBlock(block);
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
  }

  private async createBlock(): Promise<void> {
    const lastBlock = this.getLastBlock();
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
      this.addBlock(genesisBlock);
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
      this.addBlock(block);
      this.emit("message:new", new MessageChain(MessageType.BLOCK, block));
    }
  }
}
