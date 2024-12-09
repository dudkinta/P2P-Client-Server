import { Wallet } from "../wallet/wallet.js";
import { MessageChain } from "../network/services/messages/index.js";
import crypto from "crypto";

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

  constructor() {}
  public addDelegate(message: MessageChain): void {
    const wallet = message.value as Wallet;
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
