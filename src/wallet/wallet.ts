import crypto from "crypto";
import { Transaction } from "../blockchain/models/transaction.js";
import * as fs from "fs";
import * as path from "path";

export class Wallet {
  private privateKey: string;
  public publicKey: string;
  private readonly privateKeyPath = path.join(
    __dirname,
    "./data/keys/private.key"
  );
  private readonly publicKeyPath = path.join(
    __dirname,
    "./data/keys/public.key"
  );

  constructor() {
    if (this.keysExist()) {
      // Восстановление ключей из файлов
      this.privateKey = fs.readFileSync(this.privateKeyPath, "utf-8");
      this.publicKey = fs.readFileSync(this.publicKeyPath, "utf-8");
    } else {
      // Генерация новых ключей
      const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      this.privateKey = privateKey;
      this.publicKey = publicKey;

      // Сохранение ключей в файлы
      fs.writeFileSync(this.privateKeyPath, privateKey, "utf-8");
      fs.writeFileSync(this.publicKeyPath, publicKey, "utf-8");
    }
  }

  // Проверка наличия файлов с ключами
  private keysExist(): boolean {
    return (
      fs.existsSync(this.privateKeyPath) && fs.existsSync(this.publicKeyPath)
    );
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
