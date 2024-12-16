import { generateMnemonic, mnemonicToSeedSync } from "bip39";
import { BIP32Factory } from "bip32";
import * as tinySecp256k1 from "tiny-secp256k1";
const bip32 = BIP32Factory(tinySecp256k1);
import crypto from "crypto";
import { Transaction } from "../blockchain/db-context/models/transaction.js";
import { promises as fs } from "fs";
import { ConfigLoader } from "../common/config-loader.js";
import { SmartContract } from "../blockchain/db-context/models/smart-contract.js";
import { ContractTransaction } from "../blockchain/db-context/models/contract-transaction.js";
import EventEmitter from "events";

function toHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface WalletEvents {
  "wallet:change": [Wallet];
  "wallet:remove": [string];
  "wallet:error": [Error];
  "wallet:connected": [{ peerId: string; publicKey: string }];
}

export class Wallet
  extends EventEmitter<WalletEvents> {
  private static eventEmitter: EventEmitter = new EventEmitter();
  public static instances: Wallet[] = [];
  public static current: Wallet | null = null;
  private mnemonic: string | null = null;
  public keyPath: string | null = null;
  private privateKey: string | null = null;
  public walletName: string | null = null;
  public publicKey: string | null = null;
  public subname: string | null = null;
  constructor() {
    super();
  }

  public static async initialize(): Promise<void> {
    this.instances = [];
    if (!ConfigLoader.instance) {
      await ConfigLoader.initialize();
    }
    const config = ConfigLoader.getInstance();
    const walletsDir = `./data/${config.getConfig().net}/keys`;
    const walletsDirs = await this.getDirectories(walletsDir);

    for (const walletName of walletsDirs) {
      const walletPath = `${walletsDir}/${walletName}`;
      const seedFileName = `${walletPath}/seed.txt`;
      const seed = await fs.readFile(seedFileName, "utf-8");
      const subWallets = await this.getDirectories(walletPath);

      for (const subWallet of subWallets) {
        const subWalletPath = `${walletPath}/${subWallet}`;
        const keyPathFileName = `${subWalletPath}/path.txt`;
        const privateKeyFileName = `${subWalletPath}/private.key`;
        const publicKeyFileName = `${subWalletPath}/public.key`;

        const path = await fs.readFile(keyPathFileName, "utf-8");
        const privateKey = await fs.readFile(privateKeyFileName, "utf-8");
        const publicKey = await fs.readFile(publicKeyFileName, "utf-8");

        const wallet = new Wallet();
        wallet.walletName = walletName;
        wallet.subname = subWallet;
        wallet.mnemonic = seed;
        wallet.keyPath = path;
        wallet.mnemonic = seed;
        wallet.privateKey = privateKey;
        wallet.publicKey = publicKey;
        this.instances.push(wallet);
      }
    }
  }

  public static async create(name: string): Promise<Wallet> {
    const mnemonic = generateMnemonic();
    const seed = mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);
    const path = "m/44'/1'/0'/0/0";

    const child = root.derivePath(path);
    if (child.privateKey == undefined || child.publicKey == undefined) {
      throw new Error("Failed to create wallet");
    }
    const publicKey = Buffer.from(child.publicKey).toString("hex");
    const privateKey = Buffer.from(child.privateKey).toString("hex");
    if (!ConfigLoader.instance) {
      await ConfigLoader.initialize();
    }
    const config = ConfigLoader.getInstance();
    const walletsDir = `./data/${config.getConfig().net}/keys/${name}`;
    const seedPath = `${walletsDir}/seed.txt`;
    const keyPath = `${walletsDir}/0/path.txt`;
    const privateKeyPath = `${walletsDir}/0/private.key`;
    const publicKeyPath = `${walletsDir}/0/public.key`;

    if (!(await this.isExist(`${walletsDir}/0`))) {
      await fs.mkdir(`${walletsDir}/0`, { recursive: true });
    }
    await fs.writeFile(keyPath, path, "utf-8");
    await fs.writeFile(seedPath, mnemonic, "utf-8");
    await fs.writeFile(privateKeyPath, privateKey, "utf-8");
    await fs.writeFile(publicKeyPath, publicKey, "utf-8");
    const wallet = new Wallet();
    wallet.walletName = name;
    wallet.subname = "0";
    wallet.mnemonic = mnemonic;
    wallet.keyPath = path;
    wallet.privateKey = privateKey;
    wallet.publicKey = publicKey;
    this.instances.push(wallet);
    return wallet;
  }

  public static onEvent<K extends keyof WalletEvents>(
    event: K,
    listener: (...args: WalletEvents[K]) => void
  ): void {
    this.eventEmitter.on(event, listener);
  }

  private static emitEvent<K extends keyof WalletEvents>(
    event: K,
    ...args: WalletEvents[K]
  ): void {
    this.eventEmitter.emit(event, ...args);
  }

  public static use(wallet: Wallet): void {
    const config = ConfigLoader.getInstance();
    if (config.getConfig().nodeType == config.getConfig().roles.NODE) {
      if (this.current && this.current != wallet && this.current.publicKey) {
        this.emitEvent("wallet:remove", this.current.publicKey);
      }
      if (this.current != wallet) {
        this.current = wallet;
        this.emitEvent("wallet:change", wallet);
      }
    }
  }

  private static async isExist(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private static async getDirectories(folderPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      return directories;
    } catch (error) {
      console.error("Ошибка чтения директории:", error);
      return [];
    }
  }

  public signMessage(message: string): string {
    if (!this.privateKey) {
      throw new Error("Wallet is not initialized. Call 'initialize()' first.");
    }

    const hash = crypto.createHash("sha256").update(message).digest();
    const privateKeyBuffer = Buffer.from(this.privateKey, "hex");
    if (!tinySecp256k1.isPrivate(privateKeyBuffer)) {
      throw new Error("Invalid private key!");
    }
    const signature = tinySecp256k1.sign(hash, privateKeyBuffer);

    if (!signature) {
      throw new Error("Failed to sign the transaction!");
    }
    return toHex(signature);
  }

  public signTransaction(transaction: Transaction): void {
    if (!this.privateKey || !this.publicKey) {
      throw new Error("Wallet is not initialized. Call 'initialize()' first.");
    }

    if (transaction.sender !== this.publicKey) {
      throw new Error("Cannot sign transactions for other wallets!");
    }

    const transactionData = transaction.getTransactionData();
    const hash = crypto.createHash("sha256").update(transactionData).digest();
    const privateKeyBuffer = Buffer.from(this.privateKey, "hex");
    if (!tinySecp256k1.isPrivate(privateKeyBuffer)) {
      throw new Error("Invalid private key!");
    }
    const signature = tinySecp256k1.sign(hash, privateKeyBuffer);

    if (!signature) {
      throw new Error("Failed to sign the transaction!");
    }
    transaction.signature = toHex(signature);
  }

  public signSmartContract(contract: SmartContract): void {
    if (!this.privateKey || !this.publicKey) {
      throw new Error("Wallet is not initialized. Call 'initialize()' first.");
    }

    if (contract.owner !== this.publicKey) {
      throw new Error("Cannot sign contracts for other wallets!");
    }

    const contractData = contract.getContractData();
    const hash = crypto.createHash("sha256").update(contractData).digest();
    const privateKeyBuffer = Buffer.from(this.privateKey, "hex");

    if (!tinySecp256k1.isPrivate(privateKeyBuffer)) {
      throw new Error("Invalid private key!");
    }

    const signature = tinySecp256k1.sign(hash, privateKeyBuffer);

    if (!signature) {
      throw new Error("Failed to sign the smart contract!");
    }

    contract.signature = toHex(signature);
  }

  public signContractTransaction(transaction: ContractTransaction): void {
    if (!this.privateKey || !this.publicKey) {
      throw new Error("Wallet is not initialized. Call 'initialize()' first.");
    }

    if (transaction.sender !== this.publicKey) {
      throw new Error("Cannot sign transactions for other wallets!");
    }

    const transactionData = transaction.getContractTransactionData();
    const hash = crypto.createHash("sha256").update(transactionData).digest();
    const privateKeyBuffer = Buffer.from(this.privateKey, "hex");

    if (!tinySecp256k1.isPrivate(privateKeyBuffer)) {
      throw new Error("Invalid private key!");
    }

    const signature = tinySecp256k1.sign(hash, privateKeyBuffer);

    if (!signature) {
      throw new Error("Failed to sign the contract transaction!");
    }

    transaction.signature = toHex(signature);
  }
}
