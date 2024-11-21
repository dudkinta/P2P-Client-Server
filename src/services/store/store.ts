import { TimeoutError } from "@libp2p/interface";
import { OutOfLimitError } from "../../models/out-of-limit-error.js";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { readFromStream, writeToStream } from "../../helpers/stream-helper.js";
import { sendDebug } from "../socket-service.js";
import * as crypto from "crypto";
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
  StoreItem,
  RequestStore,
} from "./index.js";
import type {
  AbortOptions,
  Logger,
  Stream,
  Startable,
  Connection,
} from "@libp2p/interface";

export class StoreService implements Startable, StoreServiceInterface {
  private readonly Store = new Map<string, StoreItem>();
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

        const requestStr = await readFromStream(stream).catch((err) => {
          this.log(
            LogLevel.Error,
            `Error while sending store ${JSON.stringify(err)}`
          );
          throw err;
        });

        const request = JSON.parse(requestStr) as RequestStore;
        if (request && request.key) {
          const storeItems = this.Store.values()
            .filter((value) => value.key === request.key)
            .map((value) => JSON.stringify(value));
          const response = JSON.stringify(storeItems);
          await writeToStream(stream, response).catch((err) => {
            this.log(
              LogLevel.Error,
              `Error while receiving store ${JSON.stringify(err)}`
            );
            throw err;
          });
        }
        this.log(LogLevel.Info, `request ${JSON.stringify(request)}`);
        if (request && request.peerId) {
          const storeItems = this.Store.values()
            .filter((value) => value.peerId === request.peerId)
            .map((value) => JSON.stringify(value));
          const response = JSON.stringify(storeItems);
          await writeToStream(stream, response).catch((err) => {
            this.log(
              LogLevel.Error,
              `Error while receiving store ${JSON.stringify(err)}`
            );
            throw err;
          });
        }
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
    request: RequestStore,
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
      await writeToStream(stream, JSON.stringify(request)).catch((err) => {
        this.log(
          LogLevel.Error,
          `Error while receiving store ${JSON.stringify(err)}`
        );
        throw err;
      });
      const result = await readFromStream(stream).catch((err) => {
        this.log(
          LogLevel.Error,
          `Error while receiving store ${JSON.stringify(err)}`
        );
        throw err;
      });
      this.log(LogLevel.Info, `Received answer: ${result}`);
      if (result) {
        const storeItems = JSON.parse(result) as StoreItem[];
        storeItems.forEach((storeItem) => {
          const hash = this.getHash(storeItem.peerId, storeItem.key);
          this.Store.set(hash, storeItem);
        });
      }
      return result;
    } catch (err: any) {
      this.log(
        LogLevel.Error,
        `error while getStore ${connection.remotePeer.toString()} ${JSON.stringify(err)}`
      );

      stream?.abort(err);

      throw err;
    } finally {
      if (stream != null) {
        await stream.close(options);
      }
    }
  }

  private getHash(peer: string, key: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(`${peer}:${key}`);
    return hash.digest("hex");
  }

  putStore(storeItem: StoreItem): void {
    const hash = this.getHash(storeItem.peerId, storeItem.key);
    this.Store.set(hash, storeItem);
  }
}
