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
  PeerId,
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
  private LastUpdateMap: Map<string, number> = new Map();
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
    if (init.runOnPeerConnect ?? true) {
      // Подписываемся на события обнаружения пиров
      this.components.events.addEventListener(
        "connection:open",
        async (event: any) => {
          this.log(
            LogLevel.Info,
            `Connection open to PeerId: ${event.detail.remotePeer.toString()} Address: ${event.detail.remoteAddr.toString()}`
          );
          await this.requestStoreFromConnection(event.detail);
        }
      );
    }
  }

  readonly [Symbol.toStringTag] = "@libp2p/store";

  private async requestStoreFromConnection(
    connection: Connection
  ): Promise<void> {
    if (connection.status === "open") {
      const lastUpdate =
        this.LastUpdateMap.get(`${connection.remotePeer.toString()}:all`) ?? 0;
      const response = await this.getFromStore(
        connection,
        { key: undefined, peerId: undefined, dt: lastUpdate },
        { signal: AbortSignal.timeout(5000) }
      ).catch((err) => {
        this.log(
          LogLevel.Error,
          `Failed to get store from ${connection.remotePeer}: ${err}`
        );
      });
      if (response) {
        this.LastUpdateMap.set(
          `${connection.remotePeer.toString()}:all`,
          Date.now()
        );
        const lines = JSON.parse(response) as string[];
        for (const line of lines) {
          try {
            const storeItem = JSON.parse(line) as StoreItem;
            this.putStore(storeItem);
            this.log(
              LogLevel.Trace,
              `I have stored ${storeItem.key} from ${storeItem.peerId}`
            );
          } catch (error) {
            console.error("Failed to parse JSON:", error);
          }
        }
      }
    }
  }

  async start(): Promise<void> {
    this.log(LogLevel.Info, "Starting store service");
    await this.components.registrar.handle(this.protocol, this.handleMessage, {
      maxInboundStreams: this.maxInboundStreams,
      maxOutboundStreams: this.maxOutboundStreams,
      runOnLimitedConnection: this.runOnLimitedConnection,
    });
    this.started = true;
    setTimeout(async () => {
      await this.getFromAllPeers();
    }, 2000);
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
      this.log(LogLevel.Trace, `Received requestStr: ${requestStr}`);
      const request = JSON.parse(requestStr) as RequestStore;
      const storeItems: string[] = [];
      const dtStart = request?.dt ?? 0;
      if (request?.key) {
        for (const [key, value] of this.Store) {
          if (value.key === request.key && value.recieved >= dtStart) {
            storeItems.push(JSON.stringify(value));
          }
        }
      }
      if (request?.peerId) {
        for (const [key, value] of this.Store) {
          if (value.peerId === request.peerId && value.recieved >= dtStart) {
            storeItems.push(JSON.stringify(value));
          }
        }
      }
      if (request?.key === undefined && request?.peerId === undefined) {
        for (const [key, value] of this.Store) {
          if (value.recieved >= dtStart) {
            storeItems.push(JSON.stringify(value));
          }
        }
      }
      const response = new TextEncoder().encode(JSON.stringify(storeItems));
      await writeToStream(stream, response, { signal });
    } catch (err) {
      this.log(LogLevel.Error, `Failed to handle incoming store: ${err}`);
    } finally {
      await stream.close().catch((err) => {
        this.log(LogLevel.Warning, `Failed to close stream: ${err.message}`);
      });
    }
  }

  getStore(request: RequestStore): StoreItem[] {
    const storeItems: StoreItem[] = [];
    const dtStart = request?.dt ?? 0;
    if (request?.key) {
      for (const [key, value] of this.Store) {
        if (value.key === request.key && value.recieved >= dtStart) {
          storeItems.push(value);
        }
      }
    }
    if (request?.peerId) {
      for (const [key, value] of this.Store) {
        if (value.peerId === request.peerId && value.recieved >= dtStart) {
          storeItems.push(value);
        }
      }
    }
    if (request?.key === undefined && request?.peerId === undefined) {
      for (const [key, value] of this.Store) {
        if (value.recieved >= dtStart) {
          storeItems.push(value);
        }
      }
    }
    return storeItems;
  }

  private async getFromStore(
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
    storeItem.recieved = Date.now();
    if (this.Store.has(hash)) {
      const existingItem = this.Store.get(hash);
      if (existingItem && existingItem.dt <= storeItem.dt) {
        this.Store.set(hash, storeItem);
        this.log(
          LogLevel.Trace,
          `StoreItem ${storeItem.peerId}:${storeItem.key} updated`
        );
      }
    } else {
      this.Store.set(hash, storeItem);
      this.log(
        LogLevel.Trace,
        `StoreItem ${storeItem.peerId}:${storeItem.key} saved`
      );
    }
    this.log(LogLevel.Trace, `Store size: ${this.Store.size}`);
  }

  private deleteOldStoreItems(): void {
    for (const [key, value] of this.Store) {
      if (Date.now() - value.dt > value.ttl) {
        this.Store.delete(key);
        this.log(
          LogLevel.Trace,
          `Removed old storeItem ${value.peerId}:${value.key}`
        );
      }
    }
  }

  private deleteOldRequests(): void {
    for (const [key, value] of this.LastUpdateMap) {
      const parts: string[] = key.split(":");
      let isPresent = false;
      this.components.connectionManager
        .getConnections()
        .forEach((connection) => {
          if (connection.remotePeer.toString() === parts[0]) {
            isPresent = true;
          }
        });
      if (!isPresent) {
        this.LastUpdateMap.delete(key);
        this.log(LogLevel.Trace, `Removed old request ${key}`);
      }
    }
  }

  private async getFromAllPeers(): Promise<void> {
    const connections = this.components.connectionManager.getConnections();
    for (const connection of connections) {
      this.log(LogLevel.Info, `Getting store from ${connection.remotePeer}`);
      await this.requestStoreFromConnection(connection).catch((err) => {
        this.log(
          LogLevel.Error,
          `Failed to get store from ${connection}: ${err}`
        );
      });
    }
    this.deleteOldStoreItems();
    this.deleteOldRequests();
    setTimeout(async () => {
      await this.getFromAllPeers();
    }, 60000 * 10);
  }
}
