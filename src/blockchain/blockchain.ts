import { injectable, inject } from "inversify";
import { TYPES } from "../types.js";
import { dbContext } from "./db-context/database.js";
import { Block } from "./db-context/models/block.js";
import { Status, Transaction } from "./db-context/models/transaction.js";
import { EventEmitter } from "events";
import {
  MessageChain,
  MessageType,
  BlockValidate,
} from "./../network/services/messages/index.js";
import { Wallet } from "./../wallet/wallet.js";
import { LogLevel } from "../network/helpers/log-level.js";
import { sendDebug } from "./../network/services/socket-service.js";
import pkg from "debug";
import { UTXOPool } from "./db-context/models/utxp-pool.js";
const { debug } = pkg;

const TOTAL_COINS: number = 1000000000; // Общее количество монет (1 миллиард)
const INVEST_PERCENT: number = 0.16; // Процент инвесторов (16%)
const TOTAL_YEARS: number = 50; // Общее количество лет (50 лет)
const BLOCK_INTERVAL: number = 60; // Интервал между блоками в секундах (5 секунд)
const HALVINGS: number = 16; // Количество халвингов (16)

@injectable()
export class BlockChain extends EventEmitter {
  private head: Block | null;
  private nodes: Map<string, Block>;
  private pendingTransactions: Transaction[] = [];
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("blockchain", level, timestamp, message);
    debug("blockchain")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };

  constructor(
    @inject(TYPES.DbContext) private db: dbContext,
    @inject(TYPES.UTXOpoot) private utxoPool: UTXOPool) {
    super();
    this.head = null;
    this.nodes = new Map();
  }

  public async startAsync(): Promise<void> {
    const chain = await this.db.getBlocksAll();
    chain.sort((a, b) => a.index - b.index);

    chain.forEach((block) => {
      this.insertBlockToTree(block);
    });
    this.log(LogLevel.Info, "Blockchain initialized.");
  }

  getChainByHash(hash: string): Block[] | null {
    const node = this.nodes.get(hash);
    if (!node) return null;

    const chain: Block[] = [];
    let currentNode: Block | undefined = node;

    while (currentNode) {
      chain.unshift(currentNode);
      if (currentNode.parent) {
        currentNode = this.nodes.get(currentNode.parent.hash);
      } else {
        currentNode = undefined;
      }
    }
    return chain;
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
      this.insertBlockToTree(block);
    }
    if (message.type === MessageType.BLOCK_VALIDATE) {
      const validateData = message.value as BlockValidate;
      const block = this.nodes.get(validateData.hash);
      if (block) {
        block.addValidator(validateData, this.utxoPool);
      }
    }
    if (message.type === MessageType.TRANSACTION) {
      const transaction = message.value as Transaction;
      if (transaction.isValid()) {
        this.pendingTransactions.push(transaction);
      }
    }
    if (message.type == MessageType.REQUEST_CHAIN) {
      const hash = message.value as string;
      const block = await this.nodes.get(hash)
      if (block) {
        const messageChain = new MessageChain(MessageType.CHAIN, block, message.sender);
        this.emit("message:chain", messageChain);
      }
    }
    if (message.type == MessageType.CHAIN) {
      const block = message.value as Block;
      this.insertBlockToTree(block);
    }
    if (message.type == MessageType.HEAD_BLOCK_HASH) {
      const receiveHeadHash = message.value as string;
      const block = this.nodes.get(receiveHeadHash);
      if (!block) {
        this.emit("message:request", new MessageChain(MessageType.REQUEST_CHAIN, receiveHeadHash, ''));
      }
    }
  }

  private insertBlockToTree(block: Block): void {
    if (!block.isValid()) {
      this.log(LogLevel.Warning, `Block with hash ${block.hash} is invalid.`);
      return;
    }

    const existBlock = this.nodes.get(block.hash);
    if (!existBlock) {
      if (!block.parentHash) {
        this.nodes.set(block.hash, block);
      } else {
        const parent = this.nodes.get(block.parentHash);
        if (!parent) {
          this.emit(
            "message:request",
            new MessageChain(MessageType.REQUEST_CHAIN, block.parentHash, "")
          );
          return;
        } else {
          block.setParent(parent, this.utxoPool);
          this.nodes.set(block.hash, block);
        }
      }
    } else {
      // Если блок уже существует, обновляем валидаторов
      existBlock.addValidators(block.validators, this.utxoPool);
    }

    // Логика выбора нового head остается прежней
    const leafs = [...this.nodes.values()].filter((b) => b.children.length === 0);
    if (leafs.length > 0) {
      const maxWeightLeaf = leafs.reduce((maxLeaf, currentLeaf) =>
        !maxLeaf || currentLeaf.cummulativeWeight > maxLeaf.cummulativeWeight
          ? currentLeaf
          : maxLeaf
        , null as Block | null);

      this.head = maxWeightLeaf;

      if (this.head) {
        this.utxoPool.applyBlockToUTXOPool(this.head);
      }

      if (this.head && Wallet.current && Wallet.current.publicKey) {
        const currentWallet = Wallet.current;
        const publicKey = Wallet.current.publicKey;
        const validateSign = {
          index: this.head.index,
          hash: this.head.hash,
          publicKey: publicKey,
          sign: currentWallet.signMessage(
            `${this.head.index}:${this.head.hash}:${publicKey}`
          ),
        };
        this.head.addValidator(validateSign, this.utxoPool);
        this.emit(
          "message:validateBlock",
          new MessageChain(MessageType.BLOCK_VALIDATE, validateSign, "")
        );
      }
    }
  }

  public async createBlock(): Promise<void> {
    const lastBlock = this.getHead();
    const dtNow = Date.now();
    if (!Wallet.current) {
      this.log(LogLevel.Error, "Current wallet is null");
      return;
    }
    if (!Wallet.current.publicKey) {
      this.log(LogLevel.Error, "Public key is null");
      return;
    }
    const currentWallet = Wallet.current;
    const publicKey = Wallet.current.publicKey;
    const reward = this.calculateBlockReward(this.head?.index ?? 0) / 2;
    const rewardTransaction = new Transaction(
      [], [{
        address: publicKey,
        amount: reward
      },], dtNow
    );
    currentWallet.signTransaction(rewardTransaction);
    const txToBlock = this.pendingTransactions;
    txToBlock.forEach(tx => {
      tx.status = Status.COMPLETE
    });
    this.pendingTransactions = [];
    const lastIndex = lastBlock?.index ?? -1;
    const lastHash = lastBlock?.hash ?? '';
    const block = new Block(
      lastIndex + 1,
      lastHash,
      dtNow,
      txToBlock
    );
    this.insertBlockToTree(block);
    this.emit(
      "message:newBlock",
      new MessageChain(MessageType.BLOCK, block, '')
    );
  }

  public getHead() {
    return this.head;
  }

  public getBlock(hash: string) {
    return this.nodes.get(hash);
  }

  public getChain(hash?: string) {
    let startHash = hash ?? this.head?.hash;
    if (!startHash) {
      return;
    }
    return this.getChainByHash(startHash);
  }

}
