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
  PeerListServiceComponents,
  PeerListServiceInit,
  PeerListService as PeerListServiceInterface,
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

export class PeerListService implements Startable, PeerListServiceInterface {
  public readonly protocol: string;
  private readonly components: PeerListServiceComponents;
  private started: boolean;
  private readonly timeout: number;
  private readonly maxInboundStreams: number;
  private readonly maxOutboundStreams: number;
  private readonly runOnLimitedConnection: boolean;
  private readonly log: Logger;
  constructor(
    components: PeerListServiceComponents,
    init: PeerListServiceInit = {}
  ) {
    this.components = components;
    this.log = components.logger.forComponent("libp2p:peer-list");
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

  readonly [Symbol.toStringTag] = "@libp2p/peer-list";

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
    this.log("incoming getPeerList from %p", data.connection.remotePeer);

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("send peers timeout"));
        });

        const connections =
          await this.components.connectionManager.getConnections();
        const connectedPeers = Array.from(connections)
          .filter((conn) => conn.status === "open")
          .map((conn) => ({
            peerId: conn.remotePeer.toString(),
            address: conn.remoteAddr.toString(),
          }));
        const jsonString = JSON.stringify(connectedPeers);
        await sendAndReceive(stream, jsonString).catch((err) => {
          this.log("error while sending peerList %p", err);
          throw err;
        });
      })
      .catch((err) => {
        this.log.error(
          "incoming peers from %p failed with error",
          data.connection.remotePeer,
          err
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log(
          "incoming peers from %p completed",
          data.connection.remotePeer
        );
      });
  }

  async getConnectedPeers(
    connection: Connection,
    options: AbortOptions = {}
  ): Promise<string> {
    this.log("send peers %p", connection.remotePeer);
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
        this.log("error while receiving peerList %p", err);
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
