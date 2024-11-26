import crypto from "crypto";
import { Transaction } from "./transaction.js";

export type SmartContract = {
  id: string;
  owner: string;
  code: string;
  initialState: Record<string, any>;
  createdAt: number;
};

export type ContractTransaction = {
  contractId: string;
  functionName: string;
  arguments: any[];
  sender: string;
  timestamp: number;
};

export class Block {
  public index: number;
  public previousHash: string;
  public timestamp: number;
  public data: {
    transactions: Transaction[];
    smartContracts: SmartContract[];
    contractTransactions: ContractTransaction[];
  };
  public hash: string;

  constructor(
    index: number,
    previousHash: string,
    timestamp: number,
    data: {
      transactions: Transaction[];
      smartContracts: SmartContract[];
      contractTransactions: ContractTransaction[];
    }
  ) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.data = data;
    this.hash = this.calculateHash();
  }

  calculateHash(): string {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
          this.previousHash +
          this.timestamp +
          JSON.stringify(this.data)
      )
      .digest("hex");
  }

  isValid(): boolean {
    return this.hash === this.calculateHash();
  }

  addTransaction(tx: Transaction): void {
    this.data.transactions.push(tx);
  }

  addSmartContract(contract: SmartContract): void {
    this.data.smartContracts.push(contract);
  }

  addContractTransaction(contractTx: ContractTransaction): void {
    this.data.contractTransactions.push(contractTx);
  }

  toString(): string {
    return `
      Block #${this.index}
      Timestamp: ${this.timestamp}
      Previous Hash: ${this.previousHash}
      Hash: ${this.hash}
      Data: ${JSON.stringify(this.data, null, 2)}
    `;
  }
}
