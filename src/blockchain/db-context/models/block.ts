import crypto from "crypto";
import { Transaction } from "./transaction.js";
import { SmartContract } from "./smart-contract.js";
import { ContractTransaction } from "./contract-transaction.js";

export class Block {
  public hash: string;
  public previousHash: string;
  public index: number;
  public timestamp: number;
  public reward: Transaction;
  public transactions: Transaction[];
  public smartContracts: SmartContract[];
  public contractTransactions: ContractTransaction[];
  public validators: string[] = [];
  constructor(
    index: number,
    previousHash: string,
    timestamp: number,
    reward: Transaction,
    transactions: Transaction[] = [],
    smartContracts: SmartContract[] = [],
    contractTransactions: ContractTransaction[] = [],
  ) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.reward = reward;
    this.transactions = transactions;
    this.smartContracts = smartContracts;
    this.contractTransactions = contractTransactions;
    this.hash = this.calculateHash();
    this.reward.block = this.hash;
    for (const tx of this.transactions) {
      tx.block = this.hash;
    }
    for (const contract of this.smartContracts) {
      contract.block = this.hash;
    }
    for (const contractTx of this.contractTransactions) {
      contractTx.block = this.hash;
    }
  }

  calculateHash(): string {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
        this.previousHash +
        this.timestamp +
        JSON.stringify(this.transactions) +
        JSON.stringify(this.smartContracts) +
        JSON.stringify(this.contractTransactions)
      )
      .digest("hex");
  }

  isValid(): boolean {
    if (this.hash !== this.calculateHash()) {
      return false;
    }
    if (!this.reward.isValid()) {
      return false;
    }
    for (const tx of this.transactions) {
      if (!tx.isValid()) {
        return false;
      }
    }
    for (const contract of this.smartContracts) {
      if (!contract.isValid()) {
        return false;
      }
    }
    for (const contractTx of this.contractTransactions) {
      if (!contractTx.isValid()) {
        return false;
      }
    }
    return true;
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
      Validators: ${JSON.stringify(this.validators, null, 2)}
    `;
  }
}
