import { TimeoutError, TypedEventEmitter } from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { readFromStream, writeToStream } from "../../helpers/stream-helper.js";
import { sendDebug } from "../socket-service.js";
import { LogLevel } from "../../helpers/log-level.js";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
  MESSAGE_EXPIRATION_TIME,
} from "./constants.js";
import type {
  MessagesServiceComponents,
  MessagesServiceInit,
  MessagesService as MessagesServiceInterface,
  MessageChain,
  MessageServiceEvents,
} from "./index.js";
import type { Logger, Startable, Connection } from "@libp2p/interface";

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
    const { stream } = data;
    this.log(
      LogLevel.Info,
      `Incoming getStore from ${data.connection.remotePeer}`
    );

    try {
      const signal = AbortSignal.timeout(this.timeout);

      signal.addEventListener("abort", () => {
        this.log(LogLevel.Warning, "Timeout reached, aborting stream");
        stream.abort(new TimeoutError("Timeout during handleMessage"));
      });

      const messageStr = await readFromStream(stream, { signal });
      this.log(LogLevel.Trace, `Received messageStr: ${messageStr}`);
      const message = JSON.parse(messageStr) as MessageChain;
      message.sender = data.connection;
      const hash = message.getHash();
      if (this.messageHistory.has(hash)) {
        return;
      }
      this.messageHistory.set(hash, message);
      this.safeDispatchEvent<MessageChain>("message:receive", {
        detail: message,
      });
      this.broadcastMessage(message);
    } catch (err) {
      this.log(LogLevel.Error, `Failed to handle incoming store: ${err}`);
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
    const signal = AbortSignal.timeout(this.timeout);
    signal.addEventListener("abort", () => {
      this.log(LogLevel.Warning, "Timeout reached, aborting stream");
      connection.close();
    });

    const stream = await connection.newStream([this.protocol]);
    const buff = new TextEncoder().encode(message.toJSON());
    await writeToStream(stream, buff, { signal });
    await stream.close().catch((err) => {
      this.log(LogLevel.Warning, `Failed to close stream: ${err.message}`);
    });
  }

  async broadcastMessage(message: MessageChain): Promise<void> {
    this.log(LogLevel.Info, `Broadcasting message: ${JSON.stringify(message)}`);
    const connections = this.components.connectionManager.getConnections();

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
