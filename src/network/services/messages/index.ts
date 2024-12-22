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
  sign: string;
}
export enum MessageType {
  BLOCK = 0,
  TRANSACTION = 1,
  CHAIN = 3,
  REQUEST_CHAIN = 4,
  HEAD_BLOCK_HASH = 5,
  BLOCK_VALIDATE = 6
}

export class MessageChain {
  public type: MessageType;
  public sender: string;
  public dt: number;
  public value:
    | Block
    | Transaction
    | Block
    | string
    | BlockValidate;
  constructor(
    type: MessageType,
    value:
      | Block
      | Transaction
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
