import { TimeoutError } from "@libp2p/interface";
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

      const requestStr = await readFromStream(stream, { signal });
      const request = JSON.parse(requestStr) as RequestStore;
      const newStoreItem = JSON.parse(requestStr) as StoreItem;
      if (newStoreItem) {
        this.putStore(newStoreItem);
      }
      if (this.Store.size > 0) {
        if (request?.key) {
          const storeItems = Array.from(this.Store.values())
            .filter((value) => value.key == request.key)
            .map((value) => JSON.stringify(value));
          const response = new TextEncoder().encode(JSON.stringify(storeItems));
          await writeToStream(stream, response, { signal });
        }

        if (request?.peerId) {
          const storeItems = Array.from(this.Store.values())
            .filter((value) => value.peerId == request.peerId)
            .map((value) => JSON.stringify(value));
          const response = new TextEncoder().encode(JSON.stringify(storeItems));
          await writeToStream(stream, response, { signal });
        }
      } else {
        const nullResponse = new TextEncoder().encode(JSON.stringify([]));
        await writeToStream(stream, nullResponse, { signal });
      }
    } catch (err) {
      this.log(LogLevel.Error, `Failed to handle incoming store: ${err}`);
    } finally {
      await stream.close().catch((err) => {
        this.log(LogLevel.Warning, `Failed to close stream: ${err.message}`);
      });
    }
  }

  async getStore(
    connection: Connection,
    request: RequestStore,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log(LogLevel.Info, `Requesting store from ${connection.remotePeer}`);
    let stream: Stream | undefined;

    try {
      if (!connection || connection.status !== "open") {
        throw new Error("Connection is not open");
      }

      const signal = options.signal || AbortSignal.timeout(this.timeout);

      stream = await connection.newStream(this.protocol, {
        ...options,
        signal,
        runOnLimitedConnection: this.runOnLimitedConnection,
      });

      const requestBuffer = new TextEncoder().encode(JSON.stringify(request));
      await writeToStream(stream, requestBuffer);

      const responseStr = await readFromStream(stream, {
        signal,
      });

      this.log(LogLevel.Info, `Received store response: ${responseStr}`);
      if (!responseStr) {
        return "";
      }

      try {
        const parsedArray: string[] = JSON.parse(responseStr);
        const storeItems: StoreItem[] = parsedArray.map((item) =>
          JSON.parse(item)
        );
        storeItems.forEach((item) => {
          this.putStore(item);
        });
        console.log(storeItems);
      } catch (error) {
        console.error("Failed to parse JSON:", error);
      }

      return responseStr;
    } catch (err) {
      this.log(LogLevel.Error, `Failed to get store: ${err}`);
      throw err;
    } finally {
      if (stream) {
        await stream.close().catch((err) => {
          this.log(LogLevel.Warning, `Failed to close stream: ${err.message}`);
        });
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
    if (!this.Store.has(hash)) {
      this.Store.set(hash, storeItem);
      this.log(
        LogLevel.Trace,
        `Stored ${storeItem.key} for ${storeItem.peerId} Data: ${JSON.stringify(storeItem.value)}`
      );
      setTimeout(async () => {
        await this.sentToAllPeers(storeItem);
      }, 0);
    }
  }

  private async sentToAllPeers(storeItem: StoreItem): Promise<void> {
    const connections = this.components.connectionManager.getConnections();
    const connectedPeers = Array.from(connections).filter(
      (conn) => conn.status === "open"
    );
    connectedPeers.forEach(async (conn) => {
      try {
        const signal = AbortSignal.timeout(this.timeout);

        const stream = await conn.newStream(this.protocol, {
          signal,
          runOnLimitedConnection: this.runOnLimitedConnection,
        });
        const request = new TextEncoder().encode(JSON.stringify(storeItem));
        const requestBuffer = new TextEncoder().encode(JSON.stringify(request));
        await writeToStream(stream, requestBuffer);
      } catch (error) {
        this.log(LogLevel.Error, `Failed to broadcast to peer: ${error}`);
      }
    });
  }
}
