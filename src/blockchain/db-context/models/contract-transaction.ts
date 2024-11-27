import crypto from "crypto";
import { Entity, Column, BeforeInsert } from "typeorm";
import "reflect-metadata";

export enum TransactionStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed",
}

@Entity("contracttransactions")
export class ContractTransaction {
  @Column()
  hash: string;
  @Column()
  contract: string;
  @Column()
  block: string;
  @Column()
  functionName: string;
  @Column("jsonb")
  arguments: Record<string, string | number | boolean | object | null>;
  @Column()
  sender: string;
  @Column({
    type: "enum",
    enum: TransactionStatus,
    default: TransactionStatus.Pending,
  })
  status: TransactionStatus;
  @Column()
  timestamp: number;
  @Column()
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
  }

  @BeforeInsert()
  generateHash() {
    this.hash = crypto
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
