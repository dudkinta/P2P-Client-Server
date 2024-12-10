import crypto from "crypto";
import * as tinySecp256k1 from "tiny-secp256k1";
import { AllowedTypes } from "./common.js";

export class Transaction {
  public hash: string;
  public block?: string;
  public sender: string;
  public receiver?: string;
  public amount: number;
  public timestamp: number;
  public signature?: string;
  public type: AllowedTypes;
  constructor(
    sender: string,
    receiver: string,
    amount: number,
    type: AllowedTypes,
    timestamp: number
  ) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = amount;
    this.timestamp = timestamp;
    this.type = type;
    this.hash = this.calculateHash();
  }

  isValid(): boolean {
    if (
      !this.sender ||
      !this.amount ||
      !this.signature ||
      !this.type ||
      ((this.type as AllowedTypes) == AllowedTypes.TRANSFER && !this.receiver)
    ) {
      console.error("Transaction is missing required fields.");
      return false;
    }

    if (this.amount <= 0) {
      console.error("Transaction amount must be greater than 0.");
      return false;
    }

    const senderBuffer = Buffer.from(this.sender, "hex");
    if (!tinySecp256k1.isPoint(senderBuffer)) {
      console.error("Invalid sender public key.");
      return false;
    }

    const signatureBuffer = Buffer.from(this.signature, "hex");
    const hash = crypto
      .createHash("sha256")
      .update(this.getTransactionData())
      .digest();
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

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(this.getTransactionData())
      .digest("hex");
  }

  getTransactionData(): string {
    return JSON.stringify({
      sender: this.sender,
      receiver: this.receiver,
      amount: this.amount,
      type: this.type,
      timestamp: this.timestamp,
    });
  }
}
