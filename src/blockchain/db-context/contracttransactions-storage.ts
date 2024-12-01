import { Level } from "level";
import { ContractTransaction } from "./models/contract-transaction.js";

export class ContractTransactionStorage {
  private db: Level<string, object>;
  constructor(db: Level<string, object>) {
    this.db = db;
  }
  async save(contractTransaction: ContractTransaction): Promise<void> {
    const key = `contractTransaction:${contractTransaction.hash}`;
    await this.db.put(key, contractTransaction);
  }

  async get(hash: string): Promise<ContractTransaction> {
    try {
      const key = `contractTransaction:${hash}`;
      return (await this.db.get(key)) as ContractTransaction;
    } catch (err) {
      throw err;
    }
  }

  async getAll(): Promise<ContractTransaction[]> {
    const transactions: ContractTransaction[] = [];
    for await (const [key, value] of this.db.iterator({
      gte: "contractTransaction:",
      lte: "contractTransaction:~",
    })) {
      transactions.push(value as ContractTransaction);
    }
    return transactions;
  }

  async delete(hash: string): Promise<void> {
    const key = `contractTransaction:${hash}`;
    await this.db.del(key);
  }
}
