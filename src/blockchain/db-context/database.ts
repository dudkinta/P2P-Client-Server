import { Level } from "level";
import path from "path";
import { ConfigLoader } from "../../common/config-loader.js";
import { BlockStorage } from "./block-storage.js";
import { TransactionStorage } from "./transaction-storage.js";
import { SmartContractStorage } from "./smartcontract-storage.js";
import { ContractTransactionStorage } from "./contracttransactions-storage.js";
import { injectable } from "inversify";

@injectable()
export class dbContext {
  private config = ConfigLoader.getInstance().getConfig();
  public blockStorage: BlockStorage;
  public transactionStorage: TransactionStorage;
  public smartContractStorage: SmartContractStorage;
  public contractTransactionStorage: ContractTransactionStorage;

  public constructor() {
    const dbPath = path.join(`./data/${this.config.net}`, "leveldb");
    const db = new Level<string, object>(dbPath, { valueEncoding: "json" });
    this.blockStorage = new BlockStorage(db);
    this.transactionStorage = new TransactionStorage(db);
    this.smartContractStorage = new SmartContractStorage(db);
    this.contractTransactionStorage = new ContractTransactionStorage(db);
  }
}
