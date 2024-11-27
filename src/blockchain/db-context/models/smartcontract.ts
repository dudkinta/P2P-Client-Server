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
  initialState: Record<string, string | number | boolean | object | null>;
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
  isValid(): boolean {
    if (!this.owner || !this.code || !this.initialState || !this.signature) {
      console.error("Smartcontract is missing required fields.");
      return false;
    }

    const verify = crypto.createVerify("SHA256");
    verify.update(this.getContractData()).end();

    const isSignatureValid = verify.verify(this.owner, this.signature, "hex");
    if (!isSignatureValid) {
      console.error("Invalid transaction signature.");
      return false;
    }

    return true;
  }
  @BeforeInsert()
  generateHash() {
    this.hash = crypto
      .createHash("sha256")
      .update(this.getContractData())
      .digest("hex");
  }

  getContractData(): string {
    return JSON.stringify({
      owner: this.owner,
      code: this.code,
      initialState: this.initialState,
      timestamp: this.timestamp,
    });
  }
}
