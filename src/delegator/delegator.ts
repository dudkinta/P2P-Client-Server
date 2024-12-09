import { Wallet, WalletPublicKey } from "../wallet/wallet.js";
import { MessageChain } from "../network/services/messages/index.js";
import crypto from "crypto";
import { LogLevel } from "../network/helpers/log-level.js";
import { sendDebug } from "./../network/services/socket-service.js";
import pkg from "debug";
const { debug } = pkg;

export const REQUIRE_DELEGATE_COUNT: number = 5;

class DelegateEntry {
  public sender: string;
  public publicKey: string;
  public dt: number;
  public lastValidation: number;

  constructor(sender: string, publicKey: string) {
    this.sender = sender;
    this.publicKey = publicKey;
    this.dt = Date.now();
    this.lastValidation = Date.now() - 60 * 60 * 1000;
  }
}

export class Delegator {
  public walletDelegates: DelegateEntry[] = [];
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("delegator", level, timestamp, message);
    debug("delegator")(`[${timestamp.toISOString().slice(11, 23)}] ${message}`);
  };
  constructor() {}
  public addDelegate(message: MessageChain): void {
    const wallet = message.value as WalletPublicKey;
    this.log(
      LogLevel.Info,
      `Adding delegate message from: ${message.sender?.remotePeer.toString()}`
    );
    this.log(
      LogLevel.Info,
      `Adding delegate walletPK: ${JSON.stringify(wallet)}`
    );

    if (wallet.publicKey && message.sender) {
      this.walletDelegates.push(
        new DelegateEntry(
          message.sender.remotePeer.toString(),
          wallet.publicKey
        )
      );
    }
  }
  public removeDelegate(message: MessageChain): void {
    if (message.sender) {
      this.log(
        LogLevel.Info,
        `Removing delegate ${message.sender.remotePeer.toString()}`
      );
      const sender = message.sender.remotePeer.toString();
      this.walletDelegates = this.walletDelegates.filter(
        (delegate) => delegate.sender !== sender
      );
    }
  }
  public getDelegates(): string[] {
    return this.walletDelegates.map((delegate) => delegate.publicKey);
  }
}

function calculateHMAC(hash: string, key: string): string {
  return crypto.createHmac("sha256", hash).update(key).digest("hex");
}
export function selectDelegates(
  prevBlockHash: string,
  currentTime: number,
  neighbors: string[]
): string[] {
  // Конкатенируем хэш предыдущего блока с текущим временем
  const baseString = prevBlockHash + currentTime.toString();

  // Сортируем список соседей
  const sortedNeighbors = neighbors.sort();

  // Вычисляем случайные значения
  const randomValues = sortedNeighbors.map((publicKey) => ({
    publicKey,
    randomValue: calculateHMAC(baseString, publicKey),
  }));

  // Сортируем по randomValue
  randomValues.sort((a, b) => a.randomValue.localeCompare(b.randomValue));

  // Выбираем первых REQUIRE_DELEGATE_COUNT делегатов
  return randomValues
    .slice(0, REQUIRE_DELEGATE_COUNT)
    .map((item) => item.publicKey);
}
