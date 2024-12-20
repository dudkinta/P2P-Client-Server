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

  async get(hash: string): Promise<ContractTransaction | undefined> {
    try {
      const key = `contractTransaction:${hash}`;
      return (await this.db.get(key)) as ContractTransaction;
    } catch (err) {
      return undefined;
    }
  }

  async getAll(hashes: string[]): Promise<ContractTransaction[]> {
    const transactions: ContractTransaction[] = [];
    for (const hash of hashes) {
      const key = `contractTransaction:${hash}`;
      const value = await this.db.get(key).catch(() => null); // Если ключ не найден, вернуть null
      if (value) {
        transactions.push(value as ContractTransaction);
      }
    }
    return transactions;
  }

  async delete(hash: string): Promise<void> {
    const key = `contractTransaction:${hash}`;
    await this.db.del(key);
  }
}
