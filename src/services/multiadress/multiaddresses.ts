import { TimeoutError } from "@libp2p/interface";
import { sendAndReceive } from "../../helpers/stream-helper.js";
import { OutOfLimitError } from "./../../models/out-of-limit-error.js";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import { sendDebug } from "./../../services/socket-service.js";
import { LogLevel } from "../../helpers/log-level.js";
import { getIpAndCheckPort, CheckResult } from "../../helpers/check-ip.js";
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
  private readonly log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("libp2p:multiaddresses", level, timestamp, message);
    this.logger(`[${timestamp.toISOString().slice(11, 23)}] ${message}`);
  };
  private directAddress: CheckResult | undefined;

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
      LogLevel.Info,
      `incoming multiaddresses from ${data.connection.remotePeer.toString()}`
    );

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("send multiaddresses timeout"));
        });
        if (
          this.directAddress &&
          (this.directAddress.ipv4portOpen || this.directAddress.ipv6portOpen)
        ) {
          const addresses = [];
          if (this.directAddress.ipv4 && this.directAddress.ipv4portOpen) {
            addresses.push(
              `/ip4/${this.directAddress.ipv4}/tcp/${this.directAddress.port}/p2p/`
            );
          }
          if (this.directAddress.ipv6 && this.directAddress.ipv6portOpen) {
            addresses.push(
              `/ip6/${this.directAddress.ipv6}/tcp/${this.directAddress.port}/p2p/`
            );
          }
          let jsonString = JSON.stringify(addresses);
          await sendAndReceive(stream, jsonString).catch((err) => {
            this.log(
              LogLevel.Error,
              `error while sending multiaddresses${JSON.stringify(err)}`
            );
            throw err;
          });
        } else {
          const connections =
            await this.components.addressManager.getAddresses();

          const addresses = Array.from(connections).map((conn) =>
            conn.toString()
          );
          let jsonString = JSON.stringify(addresses);
          await sendAndReceive(stream, jsonString).catch((err) => {
            this.log(
              LogLevel.Error,
              `error while sending multiaddresses${JSON.stringify(err)}`
            );
            throw err;
          });
        }
      })
      .catch((err) => {
        this.log(
          LogLevel.Error,
          `incoming multiaddresses from ${data.connection.remotePeer.toString()} failed with error ${JSON.stringify(err)}`
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log(
          LogLevel.Info,
          `incoming multiaddresses from ${data.connection.remotePeer.toString()} completed`
        );
      });
  }

  async getMultiaddress(
    connection: Connection,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log(
      LogLevel.Info,
      `send multiaddresses ${connection.remotePeer.toString()}`
    );
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
      this.log(LogLevel.Info, `send request to ${connection.remotePeer}`);
      const result = await sendAndReceive(stream, "").catch((err) => {
        this.log(
          LogLevel.Error,
          `error while receiving multiaddresses ${JSON.stringify(err)}`
        );
        throw err;
      });
      this.log(LogLevel.Info, `received answer: ${result}`);
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

  async getDirectMultiaddress(): Promise<string[]> {
    const addresses = [];
    const addrrs = this.components.addressManager.getAddresses();
    this.log(LogLevel.Info, `Addrrs cound: ${addrrs.length.toString()}`);
    const currentPort = addrrs[0].toString().split("/tcp/")[1];
    this.directAddress = await getIpAndCheckPort(
      Number.parseFloat(currentPort)
    ).catch((err) => {
      this.log(LogLevel.Error, `Error in getIpAndCheckPort: ${err}`);
      return undefined;
    });
    this.log(
      LogLevel.Info,
      `Check IP result: ${JSON.stringify(this.directAddress)}`
    );
    if (
      this.directAddress &&
      (this.directAddress.ipv4portOpen || this.directAddress.ipv6portOpen)
    ) {
      if (this.directAddress.ipv4 && this.directAddress.ipv4portOpen) {
        addresses.push(
          `/ip4/${this.directAddress.ipv4}/tcp/${this.directAddress.port}/p2p/`
        );
      }
      if (this.directAddress.ipv6 && this.directAddress.ipv6portOpen) {
        addresses.push(
          `/ip6/${this.directAddress.ipv6}/tcp/${this.directAddress.port}/p2p/`
        );
      }
    }
    return addresses;
  }
}
