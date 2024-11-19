import { TimeoutError } from "@libp2p/interface";
import { OutOfLimitError } from "../../models/out-of-limit-error.js";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendAndReceive } from "../../helpers/stream-helper.js";
import { sendDebug } from "../socket-service.js";
import { LogLevel } from "../../helpers/log-level.js";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
} from "./constants.js";
import type {
  StoreServiceComponents,
  StoreServiceInit,
  StoreService as StoreServiceInterface,
} from "./index.js";
import type {
  AbortOptions,
  Logger,
  Stream,
  Startable,
  Connection,
} from "@libp2p/interface";

export class StoreService implements Startable, StoreServiceInterface {
  public readonly protocol: string;
  private readonly components: StoreServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly logger: Logger;
  private readonly log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("libp2p:store", level, timestamp, message);
    this.logger(`[${timestamp.toISOString().slice(11, 23)}] ${message}`);
  };
  constructor(components: StoreServiceComponents, init: StoreServiceInit = {}) {
    this.components = components;
    this.logger = components.logger.forComponent("@libp2p/store");
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

  readonly [Symbol.toStringTag] = "@libp2p/store";

  async start(): Promise<void> {
    await this.components.registrar.handle(this.protocol, this.handleMessage, {
      maxInboundStreams: this.maxInboundStreams,
      maxOutboundStreams: this.maxOutboundStreams,
      runOnLimitedConnection: this.runOnLimitedConnection,
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    await this.components.registrar.unhandle(this.protocol);
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  handleMessage(data: IncomingStreamData): void {
    this.log(
      LogLevel.Info,
      `incoming getStore from ${data.connection.remotePeer.toString()}`
    );

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("send store timeout"));
        });

        const peers = await this.components.peerStore.all();
        const store = Array.from(peers).map((peer) => ({
          peerId: peer.id.toString(),
          address: peer.addresses.map((addr) => addr.multiaddr.toString()),
        }));
        const jsonString = JSON.stringify(store);
        await sendAndReceive(stream, jsonString).catch((err) => {
          this.log(
            LogLevel.Error,
            `Error while sending store ${JSON.stringify(err)}`
          );
          throw err;
        });
      })
      .catch((err) => {
        this.log(
          LogLevel.Error,
          `incoming store from ${data.connection.remotePeer.toString()} failed with error ${JSON.stringify(err)}`
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log(
          LogLevel.Info,
          `incoming store from ${data.connection.remotePeer.toString()} completed`
        );
      });
  }

  async getStore(
    connection: Connection,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log(LogLevel.Info, `Get store ${connection.remotePeer.toString()}`);
    let stream: Stream | undefined;
    try {
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

      if (options.signal == null) {
        const signal = AbortSignal.timeout(this.timeout);

        options = {
          ...options,
          signal,
        };
      }

      stream = await connection.newStream(this.protocol, {
        ...options,
        runOnLimitedConnection: this.runOnLimitedConnection,
      });
      this.log(LogLevel.Info, `Get request to ${connection.remotePeer}`);
      const result = await sendAndReceive(stream, "").catch((err) => {
        this.log(
          LogLevel.Error,
          `Error while receiving store ${JSON.stringify(err)}`
        );
        throw err;
      });
      this.log(LogLevel.Info, `Received answer: ${result}`);
      return result;
    } catch (err: any) {
      this.log(
        LogLevel.Error,
        `error while roling ${connection.remotePeer.toString()} ${JSON.stringify(err)}`
      );

      stream?.abort(err);

      throw err;
    } finally {
      if (stream != null) {
        await stream.close(options);
      }
    }
  }
}
