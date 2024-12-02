import crypto from "crypto";
import { AllowedValue } from "./common.js";

export class SmartContract {
  hash: string;
  block?: string;
  owner: string;
  code: string;
  initialState: Record<string, AllowedValue>;
  timestamp: number;
  signature?: string;

  constructor(
    owner: string,
    code: string,
    initialState: Record<string, AllowedValue>,
    timestamp: number
  ) {
    this.owner = owner;
    this.code = code;
    this.initialState = initialState;
    this.timestamp = timestamp;
    this.hash = this.calculateHash();
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
  calculateHash() {
    return crypto
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
