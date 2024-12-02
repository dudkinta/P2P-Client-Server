import { OutOfLimitError } from "../../models/out-of-limit-error.js";
import { TimeoutError, TypedEventEmitter } from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendDebug } from "../socket-service.js";
import { LogLevel } from "../../helpers/log-level.js";
import protobuf from "protobufjs";
import { pbStream } from "it-protobuf-stream";
import { Uint8ArrayList } from "uint8arraylist";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
  MESSAGE_EXPIRATION_TIME,
} from "./constants.js";
import { MessageChain } from "./index.js";
import type {
  MessagesServiceComponents,
  MessagesServiceInit,
  MessagesService as MessagesServiceInterface,
  MessageServiceEvents,
} from "./index.js";
import type { Logger, Startable, Connection } from "@libp2p/interface";
import path from "path";
import { fileURLToPath } from "url";
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
  private messageHistory: Map<string, MessageChain> = new Map();
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
    setTimeout(() => {
      this.clearMessageHistory();
    }, 1000);
  }

  private clearMessageHistory() {
    for (const [key, message] of this.messageHistory) {
      if (Date.now() - message.dt > MESSAGE_EXPIRATION_TIME) {
        this.messageHistory.delete(key);
      }
    }
    setTimeout(() => {
      this.clearMessageHistory();
    }, 1000);
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

      const root = this.proto_root;
      const ProtobufMessageChain = root.lookupType("MessageChain");

      const pbstr = pbStream(stream);

      const signal = AbortSignal.timeout(this.timeout);
      signal.addEventListener("abort", () => {
        this.log(LogLevel.Warning, "Timeout reached, aborting stream");
        stream.abort(new TimeoutError("Timeout during handleMessage"));
      });

      while (true) {
        let decodedMessage: any;

        try {
          // Чтение сообщения из потока
          const messageData = await pbstr.read(
            {
              decode: (buffer: Uint8Array | Uint8ArrayList) => {
                const data =
                  buffer instanceof Uint8Array
                    ? buffer
                    : new Uint8Array(buffer.subarray());
                return ProtobufMessageChain.decode(data);
              },
            },
            { signal }
          );

          decodedMessage = messageData;
        } catch (err: any) {
          if (err.name === "AbortError") {
            this.log(LogLevel.Warning, "Stream reading aborted due to timeout");
            break;
          }
          this.log(LogLevel.Error, `Failed to read message: ${err.message}`);
          break;
        }

        if (!decodedMessage) {
          this.log(LogLevel.Info, "No message received, ending stream");
          break;
        }

        this.log(
          LogLevel.Trace,
          `Received decoded message: ${JSON.stringify(decodedMessage)}`
        );

        const message = MessageChain.fromProtobuf(root, decodedMessage);

        message.sender = connection;

        const hash = message.getHash();
        if (this.messageHistory.has(hash)) {
          this.log(LogLevel.Info, `Duplicate message ignored: ${hash}`);
          continue;
        }

        this.messageHistory.set(hash, message);

        this.safeDispatchEvent<MessageChain>("message:receive", {
          detail: message,
        });

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

  private async sendMessage(connection: Connection, message: MessageChain) {
    this.log(
      LogLevel.Info,
      `Sending message to ${connection.remotePeer.toString()}: ${message}`
    );
    if (connection == null) {
      throw new Error("connection is null");
    }
    if (connection.status !== "open") {
      throw new Error("connection is not open");
    }

    if (connection.limits) {
      if (connection.limits.seconds && connection.limits.seconds < 10000) {
        throw new OutOfLimitError("connection has time limits");
      }
      if (connection.limits.bytes && connection.limits.bytes < 10000) {
        throw new OutOfLimitError("connection has byte limits");
      }
    }
    const signal = AbortSignal.timeout(this.timeout);
    signal.addEventListener("abort", () => {
      this.log(LogLevel.Warning, "Timeout reached, aborting stream");
      connection.close();
    });

    const stream = await connection.newStream([this.protocol]);
    if (this.proto_root == null) {
      throw new Error("Proto root is not loaded");
    }
    const root = this.proto_root;
    const ProtobufMessageChain = root.lookupType("MessageChain");
    const pbstr = pbStream(stream);

    // Создаём Protobuf-сообщение
    const protobufMessage = message.toProtobuf(root);
    console.log(protobufMessage);
    // Отправляем сообщение
    await pbstr.write(protobufMessage, {
      encode: (data: any) => {
        const errMsg = ProtobufMessageChain.verify(data);
        if (errMsg) throw new Error(`Invalid message: ${errMsg}`);
        return ProtobufMessageChain.encode(data).finish();
      },
    });
  }

  async broadcastMessage(message: MessageChain): Promise<void> {
    this.log(LogLevel.Info, `Broadcasting message: ${JSON.stringify(message)}`);
    const connections = this.components.connectionManager.getConnections();
    if (connections.length === 0) {
      this.log(LogLevel.Warning, "No connections to broadcast message to");
    }
    for (const connection of connections) {
      try {
        if (connection !== message.sender) {
          await this.sendMessage(connection, message);
        }
      } catch (err) {
        this.log(LogLevel.Error, `Failed to broadcast message: ${err}`);
      }
    }
  }
}
