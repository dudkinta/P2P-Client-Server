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

  // Проверка валидности транзакции
  isValid(): boolean {
    // 1. Проверка обязательных полей
    if (!this.sender || !this.receiver || !this.amount || !this.signature) {
      console.error("Transaction is missing required fields.");
      return false;
    }

    // 2. Проверка суммы
    if (this.amount <= 0) {
      console.error("Transaction amount must be greater than 0.");
      return false;
    }

    // 3. Проверка подписи
    const transactionData = `${this.sender}${this.receiver}${this.amount}`;
    const verify = crypto.createVerify("SHA256");
    verify.update(transactionData).end();

    const isSignatureValid = verify.verify(this.sender, this.signature, "hex");
    if (!isSignatureValid) {
      console.error("Invalid transaction signature.");
      return false;
    }

    return true;
  }

  @BeforeInsert()
  generateHash() {
    // Вычисляем хэш на основе содержимого транзакции
    const transactionData = `${this.sender}${this.receiver}${this.amount}${this.timestamp}${this.signature}`;
    this.hash = crypto
      .createHash("sha256")
      .update(transactionData)
      .digest("hex");
  }

  toJSON(): string {
    return JSON.stringify({
      sender: this.sender,
      receiver: this.receiver,
      amount: this.amount,
      timestamp: this.timestamp,
      signature: this.signature,
    });
  }
}
