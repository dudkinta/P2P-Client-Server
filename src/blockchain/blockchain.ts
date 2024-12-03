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
import { AllowedTypes } from "./db-context/models/common.js";
import { randomInt } from "crypto";

export class BlockChain extends EventEmitter {
  private static instance: BlockChain;
  private db: dbContext;
  private chain: Block[] = [];
  private pendingTransactions: Transaction[] = [];
  private pendingSmartContracts: SmartContract[] = [];
  private pendingContractTransactions: ContractTransaction[] = [];
  private constructor() {
    super();
    this.db = new dbContext();
  }
  static getInstance(): BlockChain {
    if (!BlockChain.instance) {
      BlockChain.instance = new BlockChain();
    }
    return BlockChain.instance;
  }

  public async initAsync(): Promise<void> {
    setTimeout(async () => {
      this.sendTestMessage();
    }, 30000);
  }

  private sendTestMessage() {
    this.emit(
      "newmessage",
      new MessageChain(
        MessageType.TRANSACTION,
        new Transaction(
          "sender",
          "recipient",
          randomInt(1000),
          AllowedTypes.TRANSFER,
          0
        )
      )
    );
    setTimeout(async () => {
      this.sendTestMessage();
    }, 1000);
  }

  getChain(): Block[] {
    return this.chain;
  }

  addBlock(block: Block): void {
    this.chain.push(block);
    this.db.blockStorage.save(block);
  }

  getLastBlock(): Block | undefined {
    return this.chain[this.chain.length - 1];
  }

  async getBlock(index: number): Promise<Block | undefined> {
    const block = this.chain.find((b) => b.index === index);
    if (block) return block;
    return await this.db.blockStorage.get(index);
  }

  async getBlocksInRange(start: number, end: number): Promise<Block[]> {
    return await this.db.blockStorage.getByRange(start, end);
  }

  calculateBlockReward(
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
}
