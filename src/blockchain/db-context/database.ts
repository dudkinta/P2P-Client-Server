import "reflect-metadata";
import { DataSource } from "typeorm";
import { Block } from "./models/block.js";
import { Transaction } from "./models/transaction.js";
import { SmartContract } from "./models/smartcontract.js";
import { ContractTransaction } from "./models/contract-transaction.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "admin",
  password: "admin123",
  database: "blockchain_db",
  synchronize: true,
  logging: false,
  entities: [Block, Transaction, SmartContract, ContractTransaction],
});
