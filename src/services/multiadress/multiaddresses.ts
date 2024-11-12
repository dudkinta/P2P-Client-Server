import { TimeoutError } from "@libp2p/interface";
import { sendAndReceive } from "../../helpers/stream-helper.js";
import { OutOfLimitError } from "./../../models/out-of-limit-error.js";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendDebug } from "./../../services/socket-service.js";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
} from "./constants.js";
import type {
  MultiaddressServiceComponents,
  MultiaddressServiceInit,
  MultiaddressService as MultiaddressServiceInterface,
} from "./index.js";
import type {
  AbortOptions,
  Logger,
  Stream,
  Startable,
  Connection,
} from "@libp2p/interface";

export class MultiaddressService
  implements Startable, MultiaddressServiceInterface
{
  public readonly protocol: string;
  private readonly components: MultiaddressServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly logger: Logger;
  private readonly log = (message: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    sendDebug("libp2p:multiaddresses", `[${timestamp}] ${message}`);
    this.logger(`[${timestamp}] ${message}`);
  };
  constructor(
    components: MultiaddressServiceComponents,
    init: MultiaddressServiceInit = {}
  ) {
    this.components = components;
    this.logger = components.logger.forComponent("libp2p:multiaddresses");
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

  readonly [Symbol.toStringTag] = "@libp2p/multiaddresses";

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
      `incoming multiaddresses from ${data.connection.remotePeer.toString()}`
    );

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("send multiaddresses timeout"));
        });

        const connections = await this.components.addressManager.getAddresses();

        connections.forEach((addr) => {
          this.log(`send multiaddress ${addr.toString()}`);
        });
        const addresses = Array.from(connections).map((conn) =>
          conn.toString()
        );
        const jsonString = JSON.stringify(addresses);
        await sendAndReceive(stream, jsonString).catch((err) => {
          this.log(`error while sending multiaddresses${JSON.stringify(err)}`);
          throw err;
        });
      })
      .catch((err) => {
        this.log(
          `incoming multiaddresses from ${data.connection.remotePeer.toString()} failed with error ${JSON.stringify(err)}`
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log(
          `incoming multiaddresses from ${data.connection.remotePeer.toString()} completed`
        );
      });
  }

  async getMultiaddress(
    connection: Connection,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log(`send multiaddresses ${connection.remotePeer.toString()}`);
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
      this.log(`send request to ${connection.remotePeer}`);
      const result = await sendAndReceive(stream, "").catch((err) => {
        this.log(`error while receiving multiaddresses ${JSON.stringify(err)}`);
        throw err;
      });
      this.log(`received answer: ${result}`);
      return result;
    } catch (err: any) {
      this.log(
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
