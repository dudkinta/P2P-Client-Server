import { injectable, inject } from 'inversify';
import { TYPES } from './../types.js'
import { WalletPublicKey } from "../wallet/wallet.js";
import { EventEmitter } from "events";
import { MessageChain, MessageType } from "../network/services/messages/index.js";
import crypto from "crypto";
import { LogLevel } from "../network/helpers/log-level.js";
import {
  sendDebug,
  sendDelegate,
} from "./../network/services/socket-service.js";
import pkg from "debug";
const { debug } = pkg;

export const REQUIRE_DELEGATE_COUNT: number = 5;


export class DelegateEntry {
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

@injectable()
export class Delegator extends EventEmitter {
  public walletDelegates: DelegateEntry[] = [];
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("delegator", level, timestamp, message);
    debug("delegator")(`[${timestamp.toISOString().slice(11, 23)}] ${message}`);
  };
  constructor() {
    super();
  }
  public addDelegate(message: MessageChain): void {
    const wallet = message.value as WalletPublicKey;
    this.log(
      LogLevel.Info,
      `Add delegate walletPK: ${JSON.stringify(wallet)}`
    );

    if (wallet.publicKey && message.sender) {
      if (
        !this.walletDelegates.some(
          (delegate) =>
            delegate.sender === message.sender
        )
      ) {
        const dEntry = new DelegateEntry(
          message.sender,
          wallet.publicKey
        );
        this.walletDelegates.push(dEntry);
        sendDelegate("add", dEntry);
      }
    }
  }

  public removeValidator(message: MessageChain): void {
    this.log(
      LogLevel.Info,
      `Removing delegate ${JSON.stringify(message)}`
    );
    const wallet = message.value as WalletPublicKey;
    try {
      const dEntry = this.walletDelegates.find(
        (delegate) => delegate.publicKey === wallet.publicKey
      );
      if (dEntry) {
        sendDelegate("remove", dEntry);
        this.walletDelegates = this.walletDelegates.filter(
          (delegate) => delegate.publicKey !== wallet.publicKey
        );
      }
    } catch {
      this.log(LogLevel.Error, `Error in removeValidator. Message: ${JSON.stringify(message)}`)
    }
  }

  public disconnectDelegate(sender: string): string | undefined {
    this.log(
      LogLevel.Info,
      `Removing delegate ${sender}`
    );
    try {
      const dEntry = this.walletDelegates.find(
        (delegate) => delegate.sender === sender
      );
      if (dEntry) {
        this.log(
          LogLevel.Info,
          `Removing delegate ${dEntry.sender} ${dEntry.publicKey}`
        );
        this.walletDelegates = this.walletDelegates.filter(
          (delegate) => delegate.sender !== sender
        );
        this.emit("message:removeDelegator", new MessageChain(MessageType.WALLET_REMOVE, { publicKey: dEntry.publicKey }, ""));
        sendDelegate("remove", dEntry);
      }
      return dEntry?.publicKey;
    }
    catch {
      this.log(LogLevel.Error, `Error in disconnectValidator. Sender: ${JSON.stringify(sender)}`)
    }
  }

  public getDelegates(): DelegateEntry[] {
    return this.walletDelegates;
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
