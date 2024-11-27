import crypto from "crypto";
import { Entity, Column, BeforeInsert } from "typeorm";
import "reflect-metadata";

@Entity("transactions")
export class Transaction {
  @Column()
  hash: string; // Хэш транзакции
  @Column()
  block: string; // Хэш блока, в который включена транзакция
  @Column()
  sender: string; // Публичный ключ отправителя
  @Column()
  receiver: string; // Публичный ключ получателя
  @Column()
  amount: number;
  @Column("bigint")
  timestamp: number;
  @Column()
  signature?: string; // Подпись транзакции

  constructor(
    sender: string,
    receiver: string,
    amount: number,
    timestamp: number
  ) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = amount;
    this.timestamp = timestamp;
  }

  isValid(): boolean {
    if (!this.sender || !this.receiver || !this.amount || !this.signature) {
      console.error("Transaction is missing required fields.");
      return false;
    }

    if (this.amount <= 0) {
      console.error("Transaction amount must be greater than 0.");
      return false;
    }

    const verify = crypto.createVerify("SHA256");
    verify.update(this.getTransactionData()).end();

    const isSignatureValid = verify.verify(this.sender, this.signature, "hex");
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
      .update(this.getTransactionData())
      .digest("hex");
  }

  getTransactionData(): string {
    return JSON.stringify({
      sender: this.sender,
      receiver: this.receiver,
      amount: this.amount,
      timestamp: this.timestamp,
    });
  }
}
