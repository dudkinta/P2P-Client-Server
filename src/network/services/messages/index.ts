import { MessagesService as MessagesServiceClass } from "./messages.js";
import crypto from "crypto";
import type {
  TypedEventEmitter,
  ComponentLogger,
  PeerStore,
  TypedEventTarget,
  Libp2pEvents,
  Connection,
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";
import { Block } from "../../../blockchain/db-context/models/block.js";
import { Transaction } from "../../../blockchain/db-context/models/transaction.js";
import { SmartContract } from "../../../blockchain/db-context/models/smart-contract.js";
import { ContractTransaction } from "../../../blockchain/db-context/models/contract-transaction.js";

export interface MessageServiceEvents {
  "message:receive": CustomEvent<MessageChain>;
  "message:error": CustomEvent<Error>;
}

export interface MessagesService
  extends TypedEventEmitter<MessageServiceEvents> {
  broadcastMessage(message: MessageChain): Promise<void>;
}
export enum MessageType {
  BLOCK = "BLOCK",
  TRANSACTION = "TRANSACTION",
  SMART_CONTRACT = "SMART_CONTRACT",
  CONTRACT_TRANSACTION = "CONTRACT_TRANSACTION",
}

export class MessageChain {
  sender?: Connection;
  type: MessageType;
  dt: number;
  value: Block | Transaction | SmartContract | ContractTransaction;
  constructor(
    type: MessageType,
    value: Block | Transaction | SmartContract | ContractTransaction
  ) {
    this.type = type;
    this.dt = Date.now();
    this.value = value;
  }
  toJSON(): string {
    return JSON.stringify({ type: this.type, value: this.value });
  }
  getHash(): string {
    return crypto.createHash("sha256").update(this.toJSON()).digest("hex");
  }
  toProtobuf(root: protobuf.Root): any {
    const ProtobufMessageChain = root.lookupType("MessageChain");
    const message = {
      type: this.type,
      [this.type.toLowerCase()]: this.value,
    };

    const errMsg = ProtobufMessageChain.verify(message);
    if (errMsg) throw new Error(`Invalid message: ${errMsg}`);

    return ProtobufMessageChain.create(message);
  }

  static fromProtobuf(root: protobuf.Root, protobufMessage: any): MessageChain {
    const ProtobufMessageChain = root.lookupType("MessageChain");
    const decoded = ProtobufMessageChain.decode(protobufMessage) as any;

    if (!decoded.type) {
      throw new Error("Decoded message does not contain a valid 'type' field.");
    }

    const valueKey = decoded.type.toLowerCase();
    const value = decoded[valueKey];
    if (!value) {
      throw new Error(
        `Decoded message does not contain a valid value for type '${decoded.type}'.`
      );
    }
    return new MessageChain(decoded.type, value);
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
