import { Level } from "level";
import { Transaction } from "./models/transaction.js";

export class TransactionStorage {
  private db: Level<string, object>;
  constructor(db: Level<string, object>) {
    this.db = db;
  }
  async save(transaction: Transaction): Promise<void> {
    const key = `transaction:${transaction.hash}`;
    await this.db.put(key, transaction);
  }

  async get(hash: string): Promise<Transaction | undefined> {
    try {
      const key = `transaction:${hash}`;
      return (await this.db.get(key)) as Transaction;
    } catch (err) {
      return undefined;
    }
  }

  async getAll(hashes: string[]): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    for (const hash of hashes) {
      const key = `transaction:${hash}`;
      const value = await this.db.get(key).catch(() => null); // Если ключ не найден, вернуть null
      if (value) {
        transactions.push(value as Transaction);
      }
    }
    return transactions;
  }

  async delete(hash: string): Promise<void> {
    const key = `transaction:${hash}`;
    await this.db.del(key);
  }
}
