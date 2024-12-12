import { TypedEventEmitter } from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendDebug } from "../socket-service.js";
import { LogLevel } from "../../helpers/log-level.js";
import protobuf from "protobufjs";
import { Wallet } from "./../../../wallet/wallet.js";
import {
  writeToConnection,
  readFromConnection,
} from "../../helpers/proto-helper.js";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
  MESSAGE_EXPIRATION_TIME,
} from "./constants.js";
import { MessageChain, MessageType } from "./index.js";
import type {
  MessagesServiceComponents,
  MessagesServiceInit,
  MessagesService as MessagesServiceInterface,
  MessageServiceEvents,
} from "./index.js";
import type { Logger, Startable, Connection } from "@libp2p/interface";
import path from "path";
import { fileURLToPath } from "url";
import { BlockChain } from "../../../blockchain/blockchain.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MessagesService
  extends TypedEventEmitter<MessageServiceEvents>
  implements Startable, MessagesServiceInterface
{
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
    this.protocol = `/${
      init.protocolPrefix ?? PROTOCOL_PREFIX
    }/${PROTOCOL_NAME}/${PROTOCOL_VERSION}`;
    this.timeout = init.timeout ?? TIMEOUT;
    this.maxInboundStreams = init.maxInboundStreams ?? MAX_INBOUND_STREAMS;
    this.maxOutboundStreams = init.maxOutboundStreams ?? MAX_OUTBOUND_STREAMS;
    this.runOnLimitedConnection = init.runOnLimitedConnection ?? true;
    this.handleMessage = this.handleMessage.bind(this);
    if (init.runOnPeerConnect ?? true) {
      this.components.events.addEventListener(
        "connection:open",
        async (event: any) => {
          this.log(
            LogLevel.Info,
            `Connection open to PeerId: ${event.detail.remotePeer.toString()} Address: ${event.detail.remoteAddr.toString()}`
          );
          if (Wallet.current) {
            await this.sendMessage(
              event.detail,
              new MessageChain(
                MessageType.WALLET,
                { publicKey: Wallet.current.publicKey },
                undefined,
                [this.components.peerId.toString()]
              )
            );
          }
          const blockchain = BlockChain.getInstance();
          if (blockchain){
            await this.sendMessage(event.detail,
              new MessageChain(MessageType.HEAD_BLOCK_INDEX, blockchain.getHeadIndex())
            )
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
          const removeMessage = new MessageChain(
            MessageType.WALLET,
            new Wallet()
          );
          removeMessage.sender = event.detail;
          this.safeDispatchEvent<MessageChain>("message:removeValidator", {
            detail: removeMessage,
          });
        }
      );
    }
  }

  async start(): Promise<void> {
    this.log(LogLevel.Info, "Starting store service");
    await this.components.registrar.handle(this.protocol, this.handleMessage, {
      maxInboundStreams: this.maxInboundStreams,
      maxOutboundStreams: this.maxOutboundStreams,
      runOnLimitedConnection: this.runOnLimitedConnection,
    });

    this.proto_root = await protobuf.load(
      path.resolve(__dirname, "./message-chain.proto")
    );
    this.started = true;
    this.log(LogLevel.Info, "Started store service");
  }

  async stop(): Promise<void> {
    await this.components.registrar.unhandle(this.protocol);
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  async handleMessage(data: IncomingStreamData): Promise<void> {
    const { stream, connection } = data;
    this.log(LogLevel.Info, `Incoming message from ${connection.remotePeer}`);

    try {
      if (!this.proto_root) {
        throw new Error("Proto root is not loaded");
      }

      const decodedMessage = await readFromConnection(
        stream,
        this.proto_root,
        this.timeout,
        "MessageChain"
      ).catch((err) => {
        throw new Error(`Failed to read message: ${err.message}`);
      });
      const message = MessageChain.fromProtobuf(decodedMessage, connection);
      if (message.type == MessageType.WALLET) {
        this.log(
          LogLevel.Info,
          `Wallet message received: ${JSON.stringify(message)}`
        );
        this.safeDispatchEvent<MessageChain>("message:addValidator", {
          detail: message,
        });
        return;
      }

      this.safeDispatchEvent<MessageChain>("message:blockchainData", {
        detail: message,
      });
      if (
        !message.resender?.find((r) => r === this.components.peerId.toString())
      ) {
        this.broadcastMessage(message);
      }
    } catch (err: any) {
      this.log(
        LogLevel.Error,
        `Failed to handle incoming message: ${err.message}`
      );
    } finally {
      await stream.close().catch((err) => {
        this.log(LogLevel.Warning, `Failed to close stream: ${err.message}`);
      });
    }
  }

  public async sendMessage(
    connection: Connection,
    message: MessageChain
  ): Promise<void> {
    this.log(
      LogLevel.Info,
      `Sending message to ${connection.remotePeer.toString()}: ${JSON.stringify(message)}`
    );
    if (this.proto_root == null) {
      this.log(LogLevel.Error, `Proto root is not loaded`);
      return;
    }
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

  async broadcastMessage(message: MessageChain): Promise<void> {
    this.log(LogLevel.Info, `Broadcasting message: ${JSON.stringify(message)}`);
    const connections = this.components.connectionManager.getConnections();
    if (connections.length === 0) {
      this.log(LogLevel.Warning, "No connections to broadcast message to");
    }
    for (const connection of connections) {
      if (connection.limits) {
        continue;
      }
      try {
        if (connection !== message.sender) {
          const resender = message.resender ?? [];
          resender.push(this.components.peerId.toString());
          message.resender = resender;
          await this.sendMessage(connection, message).catch((err) => {
            this.log(LogLevel.Error, `Failed to sendMessage message: ${err}`);
          });
        }
      } catch (err) {
        this.log(LogLevel.Error, `Failed to broadcast message: ${err}`);
      }
    }
  }
}
