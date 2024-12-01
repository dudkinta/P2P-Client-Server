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

  async get(hash: string): Promise<Transaction> {
    try {
      const key = `transaction:${hash}`;
      return (await this.db.get(key)) as Transaction;
    } catch (err) {
      throw err;
    }
  }

  async getAll(): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    for await (const [key, value] of this.db.iterator({
      gte: "transaction:",
      lte: "transaction:~",
    })) {
      transactions.push(value as Transaction);
    }
    return transactions;
  }

  async delete(hash: string): Promise<void> {
    const key = `transaction:${hash}`;
    await this.db.del(key);
  }
}
