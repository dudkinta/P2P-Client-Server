import { Block } from "./models/block.js";
import { Level } from "level";

export class BlockStorage {
  private db: Level<string, object>;
  constructor(db: Level<string, object>) {
    this.db = db;
  }
  async save(block: Block) {
    const key = `block:${block.index}`;
    await this.db.put(key, block);
  }

  async get(index: number): Promise<Block | undefined> {
    try {
      const key = `block:${index}`;
      return (await this.db.get(key)) as Block;
    } catch (err) {
      return undefined;
    }
  }

  async getAll(): Promise<Block[]> {
    const blocks: Block[] = [];
    for await (const [key, value] of this.db.iterator()) {
      blocks.push(value as Block);
    }
    return blocks;
  }

  async getByRange(start: number, end: number): Promise<Block[]> {
    const blocks: Block[] = [];
    for await (const [key, value] of this.db.iterator({
      gte: `block:${start}`,
      lte: `block:${end}`,
    })) {
      blocks.push(value as Block);
    }
    return blocks;
  }

  async getLastBlock(): Promise<Block | undefined> {
    const iterator = this.db.iterator({ reverse: true, limit: 1 });
    for await (const [key, value] of iterator) {
      return value as Block;
    }
    return undefined;
  }

  async delete(index: number): Promise<void> {
    const key = `block:${index}`;
    await this.db.del(key);
  }
}
