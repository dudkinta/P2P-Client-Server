import { TimeoutError } from "@libp2p/interface";
import { sendAndReceive } from "../helpers/stream-helper.js";
import {
  PROTOCOL_PREFIX,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TIMEOUT,
  MAX_INBOUND_STREAMS,
  MAX_OUTBOUND_STREAMS,
} from "./constants.js";

export class RolesService {
  constructor(components, init = {}) {
    this.components = components;
    this.log = components.logger.forComponent("libp2p:roles");
    this.started = false;
    this.protocol = `/${init.protocolPrefix ?? PROTOCOL_PREFIX
      }/${PROTOCOL_NAME}/${PROTOCOL_VERSION}`;
    this.timeout = init.timeout ?? TIMEOUT;
    this.maxInboundStreams = init.maxInboundStreams ?? MAX_INBOUND_STREAMS;
    this.maxOutboundStreams = init.maxOutboundStreams ?? MAX_OUTBOUND_STREAMS;
    this.runOnLimitedConnection = init.runOnLimitedConnection ?? true;
    this.roleList = init.roles ?? [];
    this.handleMessage = this.handleMessage.bind(this);
  }

  async start() {
    await this.components.registrar.handle(this.protocol, this.handleMessage, {
      maxInboundStreams: this.maxInboundStreams,
      maxOutboundStreams: this.maxOutboundStreams,
      runOnLimitedConnection: this.runOnLimitedConnection,
    });
    this.started = true;
  }

  async stop() {
    await this.components.registrar.unhandle(this.protocol);
    this.started = false;
  }

  isStarted() {
    return this.started;
  }

  handleMessage(data) {
    this.log("incoming getRoles from %p", data.connection.remote);

    const { stream } = data;
    Promise.resolve()
      .then(async () => {
        const signal = AbortSignal.timeout(this.timeout);
        signal.addEventListener("abort", () => {
          stream?.abort(new TimeoutError("roles timeout"));
        });

        const jsonString = JSON.stringify(this.roleList);
        this.log(`send roles to ${data.connection.remote} Roles: ${jsonString}`);
        sendAndReceive(stream, jsonString);
        this.log("roles sent to %p", data.connection.remote);
      })
      .catch((err) => {
        this.log.error(
          "incoming getRoles from %p failed with error",
          data.connection.remotePeer,
          err
        );
        stream?.abort(err);
      })
      .finally(() => {
        this.log("incoming getRoles from %p ended", data.connection.remote);
      });
  }

  async roles(connection, options = {}) {
    this.log("send roles %p", connection.remote);
    let stream;
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

      return await sendAndReceive(stream, "");
    } catch (err) {
      this.log.error("error while roling %p", connection.remote, err);

      stream?.abort(err);

      throw err;
    } finally {
      if (stream) {
        await stream.close(options);
      }
    }
  }
}