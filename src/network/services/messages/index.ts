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
import { AllowedTypes } from "../../../blockchain/db-context/models/common.js";
export interface MessageServiceEvents {
  "message:receive": CustomEvent<MessageChain>;
  "message:error": CustomEvent<Error>;
}

export interface MessagesService
  extends TypedEventEmitter<MessageServiceEvents> {
  broadcastMessage(message: MessageChain): Promise<void>;
}
export enum MessageType {
  BLOCK = 0,
  TRANSACTION = 1,
  SMART_CONTRACT = 2,
  CONTRACT_TRANSACTION = 3,
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
    const message: any = {
      type: this.type,
    };

    // Динамически добавляем соответствующее значение в зависимости от типа
    switch (this.type) {
      case MessageType.BLOCK:
        message.block = this.value;
        break;
      case MessageType.TRANSACTION:
        message.transaction = this.value;
        break;
      case MessageType.SMART_CONTRACT:
        message.smart_contract = this.value;
        break;
      case MessageType.CONTRACT_TRANSACTION:
        message.contract_transaction = this.value;
        break;
      default:
        throw new Error(`Unsupported type: ${this.type}`);
    }

    // Проверяем сообщение перед сериализацией
    const errMsg = ProtobufMessageChain.verify(message);
    if (errMsg) throw new Error(`Invalid message: ${errMsg}`);

    return ProtobufMessageChain.create(message);
  }

  static fromProtobuf(root: protobuf.Root, protobufMessage: any): MessageChain {
    const ProtobufMessageChain = root.lookupType("MessageChain");
    if (!ProtobufMessageChain) {
      throw new Error("Protobuf message type 'MessageChain' not found.");
    }

    if (!(protobufMessage instanceof Uint8Array)) {
      console.error("Received data is not Uint8Array:", protobufMessage);
      throw new Error("Protobuf message must be a Uint8Array.");
    }

    let decoded: any;
    try {
      decoded = ProtobufMessageChain.decode(protobufMessage);
    } catch (e) {
      throw new Error(`Error decoding protobuf message: ${e.message}`);
    }

    if (!decoded) {
      throw new Error("Decoded message is empty.");
    }

    if (!decoded.type) {
      throw new Error("Decoded message does not contain a valid 'type' field.");
    }

    let value: any;

    switch (decoded.type) {
      case MessageType.TRANSACTION:
        value = decoded.transaction;
        if (!value) {
          throw new Error("Decoded message does not contain a transaction.");
        }
        if (value.timestamp) {
          value.timestamp = parseInt(value.timestamp, 10);
        }
        if (typeof value.type === "string") {
          value.type = AllowedTypes[value.type as keyof typeof AllowedTypes];
        }
        break;

      case MessageType.BLOCK:
        value = decoded.block;
        if (!value) {
          throw new Error("Decoded message does not contain a block.");
        }
        break;

      case MessageType.SMART_CONTRACT:
        value = decoded.smart_contract;
        if (!value) {
          throw new Error("Decoded message does not contain a smart contract.");
        }
        break;

      case MessageType.CONTRACT_TRANSACTION:
        value = decoded.contract_transaction;
        if (!value) {
          throw new Error(
            "Decoded message does not contain a contract transaction."
          );
        }
        break;

      default:
        throw new Error(`Unsupported message type: ${decoded.type}`);
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
