import crypto from "crypto";
import type {
  ComponentLogger,
  PeerStore,
  TypedEventTarget,
  Libp2pEvents,
  PeerId,
  PubSub
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";
import { Block } from "../../../blockchain/db-context/models/block.js";
import { Transaction } from "../../../blockchain/db-context/models/transaction.js";
import { SmartContract } from "../../../blockchain/db-context/models/smart-contract.js";
import { ContractTransaction } from "../../../blockchain/db-context/models/contract-transaction.js";
import { GossipsubEvents } from "@chainsafe/libp2p-gossipsub";

export interface MessagesService {
  startListeners(): void;
  broadcastMessage(message: MessageChain): Promise<void>;
  sendMessage(connection: string, message: MessageChain): Promise<void>;
}

export interface BlockValidate {
  index: number;
  publicKey: string;
  hash: string;
}
export enum MessageType {
  BLOCK = 0,
  TRANSACTION = 1,
  SMART_CONTRACT = 2,
  CONTRACT_TRANSACTION = 3,
  CHAIN = 4,
  REQUEST_CHAIN = 5,
  HEAD_BLOCK_HASH = 6,
  BLOCK_VALIDATE = 7
}

export class MessageChain {
  public type: MessageType;
  public sender: string;
  public dt: number;
  public value:
    | Block
    | Transaction
    | SmartContract
    | ContractTransaction
    | Block
    | string
    | BlockValidate;
  constructor(
    type: MessageType,
    value:
      | Block
      | Transaction
      | SmartContract
      | ContractTransaction
      | Block
      | string
      | BlockValidate,
    sender: string
  ) {
    this.type = type;
    this.dt = Date.now();
    this.value = value;
    this.sender = sender;
  }

  public toJSON(): string {
    return JSON.stringify({
      type: this.type,
      value: this.value
    });
  }

  public getHash(): string {
    return crypto.createHash("sha256").update(this.toJSON()).digest("hex");
  }

  public toProtobuf(root: protobuf.Root): any {
    const ProtobufMessageChain = root.lookupType("MessageChain");
    const message: any = {
      type: this.type,
      sender: this.sender
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
      case MessageType.CHAIN:
        message.block = this.value;
        break;
      case MessageType.REQUEST_CHAIN:
        message.request = this.value;
        break;
      case MessageType.HEAD_BLOCK_HASH:
        message.headHash = this.value;
        break;
      case MessageType.BLOCK_VALIDATE:
        message.block_validate = this.value;
        break;
      default:
        throw new Error(`Unsupported type (toProtobuf): ${this.type}`);
    }

    const errMsg = ProtobufMessageChain.verify(message);
    if (errMsg) throw new Error(`Invalid message: ${errMsg}`);

    return ProtobufMessageChain.create(message);
  }

  public static fromProtobuf(
    decodedMessage: any
  ): MessageChain {
    switch (decodedMessage.type) {
      case MessageType.BLOCK:
        return new MessageChain(
          MessageType.BLOCK,
          decodedMessage.block, decodedMessage.sender
        );
      case MessageType.TRANSACTION:
        return new MessageChain(
          MessageType.TRANSACTION,
          decodedMessage.transaction, decodedMessage.sender
        );
      case MessageType.SMART_CONTRACT:
        return new MessageChain(
          MessageType.SMART_CONTRACT,
          decodedMessage.smart_contract, decodedMessage.sender
        );
      case MessageType.CONTRACT_TRANSACTION:
        return new MessageChain(
          MessageType.CONTRACT_TRANSACTION,
          decodedMessage.contract_transaction, decodedMessage.sender
        );
      case MessageType.CHAIN:
        return new MessageChain(
          MessageType.CHAIN,
          decodedMessage.block, decodedMessage.sender
        );
      case MessageType.REQUEST_CHAIN:
        return new MessageChain(
          MessageType.REQUEST_CHAIN,
          decodedMessage.request, decodedMessage.sender
        );
      case MessageType.HEAD_BLOCK_HASH:
        return new MessageChain(
          MessageType.HEAD_BLOCK_HASH,
          decodedMessage.headHash, decodedMessage.sender
        );
      case MessageType.BLOCK_VALIDATE:
        return new MessageChain(
          MessageType.BLOCK_VALIDATE,
          decodedMessage.block_validate, decodedMessage.sender
        );
      default:
        throw new Error(`Unsupported type (fromProtobuf): ${decodedMessage.type}`);
    }
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
  peerId: PeerId;
  pubsub: PubSub<GossipsubEvents>;
  events: TypedEventTarget<Libp2pEvents>;
}
