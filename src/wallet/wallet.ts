import crypto from "crypto";
import { Transaction } from "../blockchain/models/transaction.js";

export class Wallet {
  private privateKey: string;
  public publicKey: string;

  constructor() {
    // Генерация ключей
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  // Подписание транзакции
  signTransaction(transaction: Transaction): void {
    if (transaction.sender !== this.publicKey) {
      throw new Error("Cannot sign transactions for other wallets!");
    }

    const transactionData = `${transaction.sender}${transaction.receiver}${transaction.amount}`;
    const sign = crypto.createSign("SHA256");
    sign.update(transactionData).end();

    // Добавление подписи в транзакцию
    transaction.signature = sign.sign(this.privateKey, "hex");
  }
}
