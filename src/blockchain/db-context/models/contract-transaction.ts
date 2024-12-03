import crypto from "crypto";
import { AllowedValue } from "./common.js";
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
  arguments: Record<string, AllowedValue>;
  sender: string;
  status: TransactionStatus;
  timestamp: number;
  signature?: string;

  constructor(
    contract: string,
    functionName: string,
    argumentList: Record<string, AllowedValue>,
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

  isValid(): boolean {
    if (!this.sender || !this.signature || !this.functionName) {
      console.error("Transaction is missing required fields.");
      return false;
    }

    const verify = crypto.createVerify("SHA256");
    verify.update(this.getContractTransactionData()).end();

    const isSignatureValid = verify.verify(this.sender, this.signature, "hex");
    if (!isSignatureValid) {
      console.error("Invalid transaction signature.");
      return false;
    }

    return true;
  }
}
