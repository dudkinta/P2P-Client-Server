import crypto from "crypto";
import { Transaction } from "./transaction.js";
import { SmartContract } from "./smartcontract.js";
import { ContractTransaction } from "./contract-transaction.js";
import { Entity, Column, OneToMany } from "typeorm";
import "reflect-metadata";

@Entity("blocks")
export class Block {
  @Column()
  public hash: string;

  @Column()
  public previousHash: string;

  @Column()
  public index: number;

  @Column("bigint")
  public timestamp: number;

  @OneToMany(() => Transaction, (transaction) => transaction.block, {
    cascade: true,
  })
  public transactions: Transaction[];

  @OneToMany(() => SmartContract, (smartContract) => smartContract.block, {
    cascade: true,
  })
  public smartContracts: SmartContract[];

  @OneToMany(
    () => ContractTransaction,
    (smartContract) => smartContract.block,
    {
      cascade: true,
    }
  )
  public contractTransactions: ContractTransaction[];

  constructor(index: number, previousHash: string, timestamp: number) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.hash = this.calculateHash();
  }

  calculateHash(): string {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
          this.previousHash +
          this.timestamp +
          JSON.stringify(this.transactions.map((_) => _.toJSON())) +
          JSON.stringify(this.smartContracts) +
          JSON.stringify(this.contractTransactions)
      )
      .digest("hex");
  }

  isValid(): boolean {
    return this.hash === this.calculateHash();
  }

  addTransaction(tx: Transaction): void {
    this.transactions.push(tx);
  }

  addSmartContract(contract: SmartContract): void {
    this.smartContracts.push(contract);
  }

  addContractTransaction(contractTx: ContractTransaction): void {
    this.contractTransactions.push(contractTx);
  }

  toString(): string {
    return `
      Block #${this.index}
      Timestamp: ${this.timestamp}
      Previous Hash: ${this.previousHash}
      Hash: ${this.hash}
      Transactions: ${JSON.stringify(this.transactions, null, 2)}
      SmartContract: ${JSON.stringify(this.smartContracts, null, 2)}
      ContractTransaction: ${JSON.stringify(this.contractTransactions, null, 2)}
    `;
  }
}
