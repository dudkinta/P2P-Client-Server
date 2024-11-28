import { Level } from "level";
import path from "path";
import { Block } from "./models/block.js";
import { Transaction } from "./models/transaction.js";
import { SmartContract } from "./models/smartcontract.js";
import { ContractTransaction } from "./models/contract-transaction.js";
import ConfigLoader from "../../common/config-loader.js";

const config = ConfigLoader.getInstance().getConfig();

const dbPath = path.join(`./data/${config.net}`, "leveldb");
const db = new Level<string, object>(dbPath, { valueEncoding: "json" });

export const BlockStorage = {
  async save(block: Block) {
    const key = `block:${block.index}`;
    await db.put(key, block);
  },

  async get(index: number): Promise<Block> {
    try {
      const key = `block:${index}`;
      return (await db.get(key)) as Block;
    } catch (err) {
      throw err;
    }
  },

  async getByRange(start: number, end: number): Promise<Block[]> {
    const blocks: Block[] = [];
    for await (const [key, value] of db.iterator({
      gte: `block:${start}`,
      lte: `block:${end}`,
    })) {
      blocks.push(value as Block);
    }
    return blocks;
  },

  async getLastBlock(): Promise<Block | undefined> {
    const iterator = db.iterator({ reverse: true, limit: 1 });
    for await (const [key, value] of iterator) {
      return value as Block;
    }
    return undefined;
  },

  async delete(index: number): Promise<void> {
    const key = `block:${index}`;
    await db.del(key);
  },
};

export const TransactionStorage = {
  async save(transaction: Transaction): Promise<void> {
    const key = `transaction:${transaction.hash}`;
    await db.put(key, transaction);
  },

  async get(hash: string): Promise<Transaction> {
    try {
      const key = `transaction:${hash}`;
      return (await db.get(key)) as Transaction;
    } catch (err) {
      throw err;
    }
  },

  async getAll(): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    for await (const [key, value] of db.iterator({
      gte: "transaction:",
      lte: "transaction:~",
    })) {
      transactions.push(value as Transaction);
    }
    return transactions;
  },

  async delete(hash: string): Promise<void> {
    const key = `transaction:${hash}`;
    await db.del(key);
  },
};

export const SmartContractStorage = {
  async save(contract: SmartContract): Promise<void> {
    const key = `smartContract:${contract.hash}`;
    await db.put(key, contract);
  },

  async get(hash: string): Promise<SmartContract> {
    try {
      const key = `smartContract:${hash}`;
      return (await db.get(key)) as SmartContract;
    } catch (err) {
      throw err;
    }
  },

  async getAll(): Promise<SmartContract[]> {
    const contracts: SmartContract[] = [];
    for await (const [key, value] of db.iterator({
      gte: "smartContract:",
      lte: "smartContract:~",
    })) {
      contracts.push(value as SmartContract);
    }
    return contracts;
  },

  async delete(hash: string): Promise<void> {
    const key = `smartContract:${hash}`;
    await db.del(key);
  },
};

export const ContractTransactionStorage = {
  async save(contractTransaction: ContractTransaction): Promise<void> {
    const key = `contractTransaction:${contractTransaction.hash}`;
    await db.put(key, contractTransaction);
  },

  async get(hash: string): Promise<ContractTransaction> {
    try {
      const key = `contractTransaction:${hash}`;
      return (await db.get(key)) as ContractTransaction;
    } catch (err) {
      throw err;
    }
  },

  async getAll(): Promise<ContractTransaction[]> {
    const transactions: ContractTransaction[] = [];
    for await (const [key, value] of db.iterator({
      gte: "contractTransaction:",
      lte: "contractTransaction:~",
    })) {
      transactions.push(value as ContractTransaction);
    }
    return transactions;
  },

  async delete(hash: string): Promise<void> {
    const key = `contractTransaction:${hash}`;
    await db.del(key);
  },
};
