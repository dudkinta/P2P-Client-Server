import { Block } from "./models/block.js";
import { Level } from "level";

export interface BlockDB {
  Index: number;
  Hash: string;
  Parent: string;
  TimeStamp: number;
  Reward: string;
  Transactions: string[];
  SmartContracts: string[];
  ContractTransaction: string[];
  Validators: string[];
}

export class BlockStorage {
  private db: Level<string, object>;
  constructor(db: Level<string, object>) {
    this.db = db;
  }
  async save(block: Block) {
    const key = `block:${block.hash}`;
    const db_block = {
      Index: block.index,
      Hash: block.hash,
      TimeStamb: block.timestamp,
      Parent: block.parent ? block.parent.hash : '',
      Reward: block.reward.hash,
      Transactions: block.transactions.map(tx => tx.hash),
      SmartContracts: block.smartContracts.map(sc => sc.hash),
      ContractTransaction: block.contractTransactions.map(tx => tx.hash),
      Validators: block.validators
    };
    await this.db.put(key, db_block);
  }

  public async get(hash: string): Promise<BlockDB | undefined> {
    try {
      const key = `block:${hash}`;
      return (await this.db.get(key)) as BlockDB;
    } catch (err) {
      return undefined;
    }
  }

  public async getAll(): Promise<BlockDB[]> {
    const blocks: BlockDB[] = [];
    for await (const [key, value] of this.db.iterator()) {
      blocks.push(value as BlockDB);
    }
    return blocks;
  }

  public async delete(hash: string): Promise<void> {
    const key = `block:${hash}`;
    await this.db.del(key);
  }
}
