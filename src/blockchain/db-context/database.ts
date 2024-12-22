import { Level } from "level";
import path from "path";
import { ConfigLoader } from "../../common/config-loader.js";
import { BlockStorage } from "./block-storage.js";
import { TransactionStorage } from "./transaction-storage.js";
import { injectable } from "inversify";
import { Block } from "./models/block.js";

@injectable()
export class dbContext {
  private config = ConfigLoader.getInstance().getConfig();
  private blockStorage: BlockStorage;
  private transactionStorage: TransactionStorage;

  public constructor() {
    const dbPath = path.join(`./data/${this.config.net}`, "leveldb");
    const db = new Level<string, object>(dbPath, { valueEncoding: "json" });
    this.blockStorage = new BlockStorage(db);
    this.transactionStorage = new TransactionStorage(db);
  }

  public async getBlocksAll(): Promise<Block[]> {
    const result: Block[] = [];
    const db_blocks = await this.blockStorage.getAll();
    db_blocks.forEach(async (bl) => {
      const reward = await this.transactionStorage.get(bl.Reward);
      if (reward) {
        const txArr = await this.transactionStorage.getAll(bl.Transactions);
        const block = new Block(bl.Index, bl.Parent, bl.TimeStamp, txArr);
        result.push(block);
      }
    });
    return result;
  }

  public async saveBlock(block: Block): Promise<void> {
    await this.blockStorage.save(block);
    block.transactions.forEach(async (tx) => {
      await this.transactionStorage.save(tx);
    });
  }
}
