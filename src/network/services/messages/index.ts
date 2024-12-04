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
import { WalletPublicKey } from "../../../wallet/wallet.js";

export interface MessageServiceEvents {
  "message:blockchainData": CustomEvent<MessageChain>;
  "message:addValidator": CustomEvent<MessageChain>;
  "message:removeValidator": CustomEvent<MessageChain>;
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
  WALLET = 4,
}

export class MessageChain {
  sender?: Connection;
  type: MessageType;
  dt: number;
  value:
    | Block
    | Transaction
    | SmartContract
    | ContractTransaction
    | WalletPublicKey;
  constructor(
    type: MessageType,
    value:
      | Block
      | Transaction
      | SmartContract
      | ContractTransaction
      | WalletPublicKey
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
      case MessageType.WALLET:
        message.wallet = this.value;
        break;
      default:
        throw new Error(`Unsupported type: ${this.type}`);
    }

    // Проверяем сообщение перед сериализацией
    const errMsg = ProtobufMessageChain.verify(message);
    if (errMsg) throw new Error(`Invalid message: ${errMsg}`);

    return ProtobufMessageChain.create(message);
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
