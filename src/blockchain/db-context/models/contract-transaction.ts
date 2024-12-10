import crypto from "crypto";
import * as tinySecp256k1 from "tiny-secp256k1";
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

    const transactionData = this.getContractTransactionData();
    const hash = crypto.createHash("sha256").update(transactionData).digest();

    const senderBuffer = Buffer.from(this.sender, "hex");
    if (!tinySecp256k1.isPoint(senderBuffer)) {
      console.error("Invalid sender public key.");
      return false;
    }
    const signatureBuffer = Buffer.from(this.signature, "hex");
    const isSignatureValid = tinySecp256k1.verify(
      hash,
      senderBuffer,
      signatureBuffer
    );
    if (!isSignatureValid) {
      console.error("Invalid transaction signature.");
      return false;
    }

    return true;
  }
}
