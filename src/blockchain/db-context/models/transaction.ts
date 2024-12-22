import crypto from "crypto";
import * as tinySecp256k1 from "tiny-secp256k1";

export enum Status {
  PENDING = 0,
  COMPLETE = 1,
  REJECT = 2
}
export interface Output {
  address: string; // Публичный ключ получателя
  amount: number; // Сумма UTXO
}
export interface Input {
  txId: string; // ID транзакции, где находится UTXO
  outputIndex: number; // Индекс UTXO в выходах этой транзакции
  address: string; // Публичный ключ владельца UTXO
  amount: number; // Сумма UTXO
  signature: string; // Подпись, подтверждающая использование UTXO
}

export class Transaction {
  public hash: string;
  public block?: string;
  public inputs: Input[];
  public outputs: Output[];
  public timestamp: number;
  public signature?: string;
  public status: Status;
  constructor(inputs: Input[], outputs: Output[], timestamp: number) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.timestamp = timestamp;
    this.status = Status.PENDING;
    this.hash = this.calculateHash();
  }

  isValid(): boolean {
    if (!this.inputs || !this.outputs || this.inputs.length === 0 || this.outputs.length === 0) {
      console.error("Transaction must have at least one input and one output.");
      return false;
    }

    // Проверяем, что все UTXO имеют подписи и суммы корректны
    for (const input of this.inputs) {
      if (!input.signature || input.amount <= 0) {
        console.error("Invalid input in transaction.");
        return false;
      }

      const senderBuffer = Buffer.from(input.address, "hex");
      if (!tinySecp256k1.isPoint(senderBuffer)) {
        console.error("Invalid input address (not a valid public key).");
        return false;
      }

      const signatureBuffer = Buffer.from(input.signature, "hex");
      const hash = crypto
        .createHash("sha256")
        .update(this.getTransactionData())
        .digest();
      if (!tinySecp256k1.verify(hash, senderBuffer, signatureBuffer)) {
        console.error("Invalid input signature.");
        return false;
      }
    }

    // Проверяем, что сумма входов >= сумма выходов
    const inputSum = this.inputs.reduce((sum, input) => sum + input.amount, 0);
    const outputSum = this.outputs.reduce((sum, output) => sum + output.amount, 0);
    if (inputSum < outputSum) {
      console.error("Input sum is less than output sum.");
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
      inputs: this.inputs,
      outputs: this.outputs,
      timestamp: this.timestamp,
    });
  }
}
