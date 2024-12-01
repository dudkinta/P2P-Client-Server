import { MessagesService as MessagesServiceClass } from "./messages.js";
import crypto from "crypto";
import type {
  ComponentLogger,
  PeerStore,
  TypedEventTarget,
  Libp2pEvents,
  Connection,
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";
import { Block } from "../../../blockchain/db-context/models/block.js";
import { Transaction } from "../../../blockchain/db-context/models/transaction.js";
import { SmartContract } from "../../../blockchain/db-context/models/smartcontract.js";
import { ContractTransaction } from "../../../blockchain/db-context/models/contract-transaction.js";

export interface MessagesService {
  broadcastMessage(message: MessageChain): Promise<void>;
}

export class MessageChain {
  sender?: Connection;
  key: string;
  dt: number;
  value: Block | Transaction | SmartContract | ContractTransaction;
  constructor(
    key: string,
    value: Block | Transaction | SmartContract | ContractTransaction
  ) {
    this.key = key;
    this.dt = Date.now();
    this.value = value;
  }
  toJSON(): string {
    return JSON.stringify({ key: this.key, value: this.value });
  }
  getHash(): string {
    return crypto.createHash("sha256").update(this.toJSON()).digest("hex");
  }
}

export interface MessagesServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  runOnPeerConnect?: boolean;
  timeout?: number;
}

export interface MessagesServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  peerStore: PeerStore;
  logger: ComponentLogger;
  events: TypedEventTarget<Libp2pEvents>;
}

export function messages(
  init: MessagesServiceInit = {}
): (components: MessagesServiceComponents) => MessagesService {
  return (components) => new MessagesServiceClass(components, init);
}
