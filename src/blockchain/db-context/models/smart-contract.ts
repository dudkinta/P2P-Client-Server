import crypto from "crypto";
import * as tinySecp256k1 from "tiny-secp256k1";
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
      console.error("SmartContract is missing required fields.");
      return false;
    }

    const contractData = this.getContractData();
    const hash = crypto.createHash("sha256").update(contractData).digest();

    const ownerBuffer = Buffer.from(this.owner, "hex");
    if (!tinySecp256k1.isPoint(ownerBuffer)) {
      console.error("Invalid owner public key.");
      return false;
    }
    const signatureBuffer = Buffer.from(this.signature, "hex");
    const isSignatureValid = tinySecp256k1.verify(
      hash,
      ownerBuffer,
      signatureBuffer
    );
    if (!isSignatureValid) {
      console.error("Invalid smart contract signature.");
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
