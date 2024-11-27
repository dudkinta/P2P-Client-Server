import crypto from "crypto";
import { Transaction } from "../blockchain/db-context/models/transaction.js";
import { promises as fs } from "fs";
import ConfigLoader from "../common/config-loader.js";

export class Wallet {
  private privateKey: string | null = null;
  public publicKey: string | null = null;
  private config = ConfigLoader.getInstance();
  constructor() {}

  async initialize(): Promise<void> {
    const privateKeyPath = `./data/${this.config.getConfig().net}/keys/private.key`;
    const publicKeyPath = `./data/${this.config.getConfig().net}/keys/public.key`;
    if (await this.keysExist(privateKeyPath, publicKeyPath)) {
      // Восстановление ключей из файлов
      this.privateKey = await fs.readFile(privateKeyPath, "utf-8");
      this.publicKey = await fs.readFile(publicKeyPath, "utf-8");
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
      await fs.writeFile(privateKeyPath, privateKey, "utf-8");
      await fs.writeFile(publicKeyPath, publicKey, "utf-8");
    }
  }

  // Проверка наличия файлов с ключами
  private async keysExist(
    privateKeyPath: string,
    publicKeyPath: string
  ): Promise<boolean> {
    try {
      await fs.access(privateKeyPath);
      await fs.access(publicKeyPath);
      return true;
    } catch {
      return false;
    }
  }

  // Подписание транзакции
  signTransaction(transaction: Transaction): void {
    if (!this.privateKey || !this.publicKey) {
      throw new Error("Wallet is not initialized. Call 'initialize()' first.");
    }

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
