import crypto from "crypto";
import { Entity, Column, BeforeInsert } from "typeorm";
import "reflect-metadata";

@Entity("smartcontracts")
export class SmartContract {
  @Column()
  hash: string;
  @Column()
  block: string;
  @Column()
  owner: string;
  @Column()
  code: string;
  @Column("jsonb")
  initialState: Record<string, any>;
  @Column("bigint")
  timestamp: number;
  @Column()
  signature?: string;

  constructor(
    owner: string,
    code: string,
    initialState: Record<string, any>,
    timestamp: number
  ) {
    this.owner = owner;
    this.code = code;
    this.initialState = initialState;
    this.timestamp = timestamp;
  }

  @BeforeInsert()
  generateHash() {
    const data = `${this.owner}${this.code}${this.initialState}${this.timestamp}${this.signature}`;
    this.hash = crypto.createHash("sha256").update(data).digest("hex");
  }
}
