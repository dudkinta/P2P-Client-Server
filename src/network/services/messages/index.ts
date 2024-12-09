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
  "message:requestchain": CustomEvent<MessageChain>;
  "message:error": CustomEvent<Error>;
}

export interface MessagesService
  extends TypedEventEmitter<MessageServiceEvents> {
  broadcastMessage(message: MessageChain): Promise<void>;
  sendMessage(connection: Connection, message: MessageChain): Promise<void>;
}

export interface MessageRequest {
  key: string;
  index: number;
}
export interface BlockChainMessage {
  key: string;
  maxIndex: number;
  block: Block;
}
export enum MessageType {
  BLOCK = 0,
  TRANSACTION = 1,
  SMART_CONTRACT = 2,
  CONTRACT_TRANSACTION = 3,
  WALLET = 4,
  CHAIN = 5,
  REQUEST_CHAIN = 6,
}

export class MessageChain {
  public sender?: Connection;
  public type: MessageType;
  public dt: number;
  public value:
    | Block
    | Transaction
    | SmartContract
    | ContractTransaction
    | WalletPublicKey
    | BlockChainMessage
    | MessageRequest;
  constructor(
    type: MessageType,
    value:
      | Block
      | Transaction
      | SmartContract
      | ContractTransaction
      | WalletPublicKey
      | BlockChainMessage
      | MessageRequest,
    sender?: Connection
  ) {
    this.type = type;
    this.dt = Date.now();
    this.value = value;
    this.sender = sender;
  }

  public toJSON(): string {
    return JSON.stringify({ type: this.type, value: this.value });
  }
  public getHash(): string {
    return crypto.createHash("sha256").update(this.toJSON()).digest("hex");
  }
  public toProtobuf(root: protobuf.Root): any {
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
      case MessageType.CHAIN:
        message.chain = this.value;
        break;
      case MessageType.REQUEST_CHAIN:
        message.request = this.value;
        break;
      default:
        throw new Error(`Unsupported type: ${this.type}`);
    }

    // Проверяем сообщение перед сериализацией
    const errMsg = ProtobufMessageChain.verify(message);
    if (errMsg) throw new Error(`Invalid message: ${errMsg}`);

    return ProtobufMessageChain.create(message);
  }

  public static fromProtobuf(
    decodedMessage: any,
    sender: Connection
  ): MessageChain {
    switch (decodedMessage.type) {
      case MessageType.BLOCK:
        return new MessageChain(
          MessageType.BLOCK,
          decodedMessage.block,
          sender
        );
      case MessageType.TRANSACTION:
        return new MessageChain(
          MessageType.TRANSACTION,
          decodedMessage.transaction,
          sender
        );
      case MessageType.SMART_CONTRACT:
        return new MessageChain(
          MessageType.SMART_CONTRACT,
          decodedMessage.smart_contract,
          sender
        );
      case MessageType.CONTRACT_TRANSACTION:
        return new MessageChain(
          MessageType.CONTRACT_TRANSACTION,
          decodedMessage.contract_transaction,
          sender
        );
      case MessageType.WALLET:
        return new MessageChain(
          MessageType.WALLET,
          decodedMessage.wallet,
          sender
        );
      case MessageType.CHAIN:
        return new MessageChain(
          MessageType.CHAIN,
          decodedMessage.chain,
          sender
        );
      case MessageType.REQUEST_CHAIN:
        return new MessageChain(
          MessageType.REQUEST_CHAIN,
          decodedMessage.request,
          sender
        );
      default:
        throw new Error(`Unsupported type: ${decodedMessage.type}`);
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
  events: TypedEventTarget<Libp2pEvents>;
}

export function messages(
  init: MessagesServiceInit = {}
): (components: MessagesServiceComponents) => MessagesService {
  return (components) => new MessagesServiceClass(components, init);
}
