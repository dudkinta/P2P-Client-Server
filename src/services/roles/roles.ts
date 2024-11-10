import { TimeoutError } from "@libp2p/interface";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
} from "./constants.js";
import type {
  RolesServiceComponents,
  RolesServiceInit,
  RolesService as RolesServiceInterface,
} from "./index.js";
import type {
  AbortOptions,
  Logger,
  Stream,
  Startable,
  Connection,
} from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendAndReceive } from "../../helpers/stream-helper.js";

export class RolesService implements Startable, RolesServiceInterface {
  public readonly protocol: string;
  private readonly components: RolesServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly log: Logger;
  private readonly roleList: string[];
  constructor(components: RolesServiceComponents, init: RolesServiceInit = {}) {
    this.components = components;
    this.log = components.logger.forComponent("libp2p:roles");
    this.started = false;
    this.protocol = `/${
      init.protocolPrefix ?? PROTOCOL_PREFIX
    }/${PROTOCOL_NAME}/${PROTOCOL_VERSION}`;
    this.timeout = init.timeout ?? TIMEOUT;
    this.maxInboundStreams = init.maxInboundStreams ?? MAX_INBOUND_STREAMS;
    this.maxOutboundStreams = init.maxOutboundStreams ?? MAX_OUTBOUND_STREAMS;
    this.runOnLimitedConnection = init.runOnLimitedConnection ?? true;
    this.roleList = init.roles ?? [];
    this.handleMessage = this.handleMessage.bind(this);
  }

  readonly [Symbol.toStringTag] = "@libp2p/roles";

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
    this.log("incoming getRoles from %p", data.connection.remotePeer);

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("send roles timeout"));
        });

        const jsonString = JSON.stringify(this.roleList);
        await sendAndReceive(stream, jsonString).catch((err) => {
          this.log.error("send roles to %p failed with error", err);
          stream?.abort(err);
        });
      })
      .catch((err) => {
        this.log.error(
          "incoming roles from %p failed with error",
          data.connection.remotePeer,
          err
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log(
          "incoming roles from %p completed",
          data.connection.remotePeer
        );
      });
  }

  async roles(
    connection: Connection,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log("send roles %p", connection.remotePeer);
    let stream: Stream | undefined;
    try {
      if (connection == null) {
        throw new Error("connection is null");
      }
      if (connection.status !== "open") {
        throw new Error("connection is not open");
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
        this.log("send roles to %p failed with error", err);
        throw err;
      });
      this.log(`received answer: ${result}`);
      return result;
    } catch (err: any) {
      this.log.error("error while roling %p", connection.remotePeer, err);

      stream?.abort(err);

      throw err;
    } finally {
      if (stream != null) {
        await stream.close(options);
      }
    }
  }
}
