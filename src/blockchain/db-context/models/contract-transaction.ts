import crypto from "crypto";

export enum TransactionStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed",
}

export class ContractTransaction {
  hash: string;
  contract: string;
  block?: string;
  functionName: string;
  arguments: Record<string, string | number | boolean | object | null>;
  sender: string;
  status: TransactionStatus;
  timestamp: number;
  signature?: string;

  constructor(
    contract: string,
    functionName: string,
    argumentList: Record<string, string | number | boolean | object | null>,
    sender: string,
    timestamp: number
  ) {
    this.contract = contract;
    this.functionName = functionName;
    this.arguments = argumentList;
    this.sender = sender;
    this.timestamp = timestamp;
    this.status = TransactionStatus.Pending;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(this.getContractTransactionData())
      .digest("hex");
  }
  getContractTransactionData(): string {
    return JSON.stringify({
      contract: this.contract,
      functionName: this.functionName,
      arguments: this.arguments,
      sender: this.sender,
      timestamp: this.timestamp,
    });
  }
}
