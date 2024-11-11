import { sendAndReceive } from "../../helpers/stream-helper.js";
import { ProtocolError, TimeoutError } from "@libp2p/interface";
import { OutOfLimitError } from "./../../models/out-of-limit-error.js";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import type { Multiaddr } from "@multiformats/multiaddr";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
} from "./constants.js";
import type {
  PingServiceComponents,
  PingServiceInit,
  PingService as PingServiceInterface,
} from "./index.js";
import type {
  AbortOptions,
  Logger,
  Stream,
  Startable,
  Connection,
} from "@libp2p/interface";

export class PingService implements Startable, PingServiceInterface {
  public readonly protocol: string;
  private readonly components: PingServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly log: Logger;

  constructor(components: PingServiceComponents, init: PingServiceInit = {}) {
    this.components = components;
    this.log = components.logger.forComponent("libp2p:ping");
    this.started = false;
    this.protocol = `/${init.protocolPrefix ?? PROTOCOL_PREFIX}/${PROTOCOL_NAME}/${PROTOCOL_VERSION}`;
    this.timeout = init.timeout ?? TIMEOUT;
    this.maxInboundStreams = init.maxInboundStreams ?? MAX_INBOUND_STREAMS;
    this.maxOutboundStreams = init.maxOutboundStreams ?? MAX_OUTBOUND_STREAMS;
    this.runOnLimitedConnection = init.runOnLimitedConnection ?? true;

    this.handleMessage = this.handleMessage.bind(this);
  }

  readonly [Symbol.toStringTag] = "@libp2p/ping";

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
    this.log("incoming ping from %p", data.connection.remotePeer);

    const { stream } = data;
    const start = Date.now();

    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("ping timeout"));
        });

        const pingData = [0, 1, 2, 3, 4, 5, 6, 7];
        const jsonString = JSON.stringify(pingData);
        await sendAndReceive(stream, jsonString).catch((err) => {
          this.log("error while sending ping ack", err);
          throw err;
        });
      })
      .catch((err) => {
        this.log.error(
          "incoming ping from %p failed with error",
          data.connection.remotePeer,
          err
        );
        stream?.abort(err);
      })
      .finally(async () => {
        const ms = Date.now() - start;
        await stream?.close();
        this.log(
          "incoming ping from %p complete in %dms",
          data.connection.remotePeer,
          ms
        );
      });
  }

  async ping(addrr: Multiaddr, options: AbortOptions = {}): Promise<number> {
    this.log("pinging %p", addrr);
    let stream: Stream | undefined;

    try {
      const start = Date.now();
      this.log("opening connection to %p", addrr.toString());
      const connection = await this.components.connectionManager.openConnection(
        addrr,
        options
      );
      this.log(`connection to %p status:${connection?.status}`);
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
      const pingData = [0, 1, 2, 3, 4, 5, 6, 7];
      const jsonString = JSON.stringify(pingData);
      const result = await sendAndReceive(stream, jsonString).catch((err) => {
        this.log('error while sending ping "%s"', err);
        throw err;
      });

      const ms = Date.now() - start;

      const resultDate = JSON.parse(result);
      if (!this.isEquals(resultDate, pingData)) {
        console.log(result, jsonString);
        throw new ProtocolError(`Received wrong ping ack after ${ms}ms`);
      }

      this.log("ping %p complete in %dms", connection.remotePeer, ms);

      return ms;
    } catch (err: any) {
      this.log.error("error while pinging %p", addrr, err);

      stream?.abort(err);

      throw err;
    } finally {
      await stream?.close(options);
    }
  }

  private isEquals(a: any, b: any): boolean {
    // Check for strict equality
    if (a === b) {
      return true;
    }

    // Check if both are arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      // Arrays must be of same length
      if (a.length !== b.length) {
        return false;
      }
      // Compare each element recursively
      for (let i = 0; i < a.length; i++) {
        if (!this.isEquals(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }

    // Check if both are non-null objects
    if (
      a !== null &&
      b !== null &&
      typeof a === "object" &&
      typeof b === "object"
    ) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      // Objects must have the same number of keys
      if (aKeys.length !== bKeys.length) {
        return false;
      }

      // Compare each key-value pair recursively
      for (let key of aKeys) {
        if (!b.hasOwnProperty(key) || !this.isEquals(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }

    // Fallback for non-matching types or values
    return false;
  }
}
