import { TypedEventEmitter } from "@libp2p/interface";
import { sendDebug } from "../socket-service.js";
import { LogLevel } from "../../helpers/log-level.js";
import protobuf from "protobufjs";
import {
  writeToConnection,
  readFromConnection,
} from "../../helpers/proto-helper.js";

import { Wallet } from "./../../../wallet/wallet.js";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
} from "./constants.js";
import { MessageChain, MessageType } from "./index.js";
import type {
  MessagesServiceComponents,
  MessagesServiceInit,
  MessagesService as MessagesServiceInterface,
  MessageServiceEvents,
} from "./index.js";
import type { Logger, Startable, Message } from "@libp2p/interface";
import path from "path";
import { fileURLToPath } from "url";
import { BlockChain } from "../../../blockchain/blockchain.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MessagesService
  extends TypedEventEmitter<MessageServiceEvents>
  implements Startable, MessagesServiceInterface {
  public readonly protocol: string;
  private readonly components: MessagesServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly logger: Logger;
  private readonly log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("libp2p:messages", level, timestamp, message);
    this.logger(`[${timestamp.toISOString().slice(11, 23)}] ${message}`);
  };
  private proto_root?: protobuf.Root;

  constructor(
    components: MessagesServiceComponents,
    init: MessagesServiceInit = {}
  ) {
    super();
    this.components = components;
    this.logger = components.logger.forComponent("@libp2p/messages");
    this.started = false;
    this.protocol = `/${init.protocolPrefix ?? PROTOCOL_PREFIX
      }/${PROTOCOL_NAME}/${PROTOCOL_VERSION}`;
    this.timeout = init.timeout ?? TIMEOUT;
    this.maxInboundStreams = init.maxInboundStreams ?? MAX_INBOUND_STREAMS;
    this.maxOutboundStreams = init.maxOutboundStreams ?? MAX_OUTBOUND_STREAMS;
    this.runOnLimitedConnection = init.runOnLimitedConnection ?? true;
    if (init.runOnPeerConnect ?? true) {
      this.components.events.addEventListener(
        "connection:open",
        async (event: any) => {
          this.log(
            LogLevel.Info,
            `Connection open to PeerId: ${event.detail.remotePeer.toString()} Address: ${event.detail.remoteAddr.toString()}`
          );
          if (Wallet.current) {
            await this.broadcastMessage(new MessageChain(MessageType.WALLET, { publicKey: Wallet.current.publicKey }, this.components.peerId.toString()));
          }
          const blockchain = BlockChain.getInstance();
          if (blockchain) {
            await this.broadcastMessage(new MessageChain(MessageType.HEAD_BLOCK_INDEX, blockchain.getHeadIndex(), this.components.peerId.toString()));
          }
        }
      );
      this.components.events.addEventListener(
        "connection:close",
        async (event: any) => {
          this.log(
            LogLevel.Info,
            `Connection close to PeerId: ${event.detail.remotePeer.toString()} Address: ${event.detail.remoteAddr.toString()}`
          );
          this.safeDispatchEvent("message:removeValidator", { detail: event.detail.remotePeer.toString() });
        }
      );
    }
  }

  async start(): Promise<void> {
    this.log(LogLevel.Info, "Starting store service");
    if (this.components.pubsub) {
      this.components.pubsub.addEventListener('message', this.messageHandler);
    }
    else {
      this.log(LogLevel.Critical, `PubSub not present`);
    }

    this.proto_root = await protobuf.load(
      path.resolve(__dirname, "./message-chain.proto")
    );
    this.started = true;
    this.log(LogLevel.Info, "Started messages service");
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  public startListeners() {
    Object.keys(MessageType).filter(key => isNaN(Number(key))).map((typeName) => {
      try {
        this.log(LogLevel.Info, `Subscribe to ${typeName}`);
        this.components.pubsub.subscribe(typeName);
      }
      catch (err) {
        console.log(err);
      }
    });
  }

  private async messageHandler(evt: CustomEvent<Message>): Promise<void> {
    const msg = evt.detail;
    if (this.proto_root) {
      const ProtobufMessageChain = this.proto_root.lookupType('MessageChain');
      const bufferMessage = ProtobufMessageChain.decode(msg.data);
      const message = MessageChain.fromProtobuf(bufferMessage);
      switch (message.type) {
        case MessageType.HEAD_BLOCK_INDEX: {
          this.safeDispatchEvent("message:headIndex", { detail: message.value as number });
          break;
        }
        case MessageType.WALLET: {
          this.safeDispatchEvent('message:addValidator', { detail: message });
          break;
        }
        case MessageType.REQUEST_CHAIN: {
          this.safeDispatchEvent('message:requestchain', { detail: message });
          break;
        }
        case MessageType.BLOCK, MessageType.CHAIN, MessageType.TRANSACTION, MessageType.SMART_CONTRACT, MessageType.CONTRACT_TRANSACTION: {
          this.safeDispatchEvent('message:blockchainData', { detail: message });
          break;
        }
        default: {
          this.safeDispatchEvent('message:unknown', { detail: message });
        }
      }

    }
  }

  async broadcastMessage(message: MessageChain): Promise<void> {
    this.log(LogLevel.Info, `Broadcasting message: ${JSON.stringify(message)}`);
    if (this.proto_root) {
      const protoType = this.proto_root.lookupType('MessageChain');
      const msg = message.toProtobuf(this.proto_root);
      const data = protoType.encode(msg).finish();
      await this.components.pubsub.publish(MessageType[message.type], data);
    }
  }

  public async sendMessage(
    peer: string,
    message: MessageChain
  ): Promise<void> {
    this.log(
      LogLevel.Info,
      `Sending message to ${peer}: ${JSON.stringify(message)}`
    );
    if (this.proto_root == null) {
      this.log(LogLevel.Error, `Proto root is not loaded`);
      return;
    }
    const connection = this.components.connectionManager.getConnections().find((c) => c.remotePeer.toString() == peer);
    if (connection) {
      await writeToConnection(
        connection,
        this.timeout,
        this.proto_root,
        this.protocol,
        "MessageChain",
        message
      ).catch((err) => {
        this.log(LogLevel.Error, `Failed to write message: ${err.message}`);
      });
    }
  }

}
