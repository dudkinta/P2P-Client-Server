import { TimeoutError } from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendAndReceive } from "../../helpers/stream-helper.js";
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

export class RolesService implements Startable, RolesServiceInterface {
  public readonly protocol: string;
  private readonly components: RolesServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly logger: Logger;
  private readonly log = (message: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    sendDebug("libp2p/roles", `[${timestamp}] ${message}`);
    this.logger(`[${timestamp}] ${message}`);
  };
  private readonly roleList: string[];
  constructor(components: RolesServiceComponents, init: RolesServiceInit = {}) {
    this.components = components;
    this.logger = components.logger.forComponent("libp2p/roles");
    this.logger.enabled = true;
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
    this.log(`incoming getRoles from ${data.connection.remotePeer.toString()}`);

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("send roles timeout"));
        });

        const jsonString = JSON.stringify(this.roleList);
        await sendAndReceive(stream, jsonString).catch((err) => {
          this.log(`send roles to %p failed with error ${JSON.stringify(err)}`);
          stream?.abort(err);
        });
      })
      .catch((err) => {
        this.log(
          `incoming roles from ${data.connection.remotePeer.toString()} failed with error ${JSON.stringify(err)}`
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log(
          `incoming roles from %p completed ${data.connection.remotePeer.toString()}`
        );
      });
  }

  async roles(
    connection: Connection,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log(`send roles ${connection.remotePeer.toString()}`);
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
        this.log(`send roles to %p failed with error ${JSON.stringify(err)}`);
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
