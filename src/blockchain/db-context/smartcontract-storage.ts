import { Level } from "level";
import { SmartContract } from "./models/smartcontract.js";

export class SmartContractStorage {
  private db: Level<string, object>;
  constructor(db: Level<string, object>) {
    this.db = db;
  }
  async save(contract: SmartContract): Promise<void> {
    const key = `smartContract:${contract.hash}`;
    await this.db.put(key, contract);
  }

  async get(hash: string): Promise<SmartContract> {
    try {
      const key = `smartContract:${hash}`;
      return (await this.db.get(key)) as SmartContract;
    } catch (err) {
      throw err;
    }
  }

  async getAll(): Promise<SmartContract[]> {
    const contracts: SmartContract[] = [];
    for await (const [key, value] of this.db.iterator({
      gte: "smartContract:",
      lte: "smartContract:~",
    })) {
      contracts.push(value as SmartContract);
    }
    return contracts;
  }

  async delete(hash: string): Promise<void> {
    const key = `smartContract:${hash}`;
    await this.db.del(key);
  }
}
