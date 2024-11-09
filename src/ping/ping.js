import { sendAndReceive } from './../helpers/stream-helper.js'
import { ProtocolError, TimeoutError } from "@libp2p/interface";
import {
    PROTOCOL_VERSION,
    PROTOCOL_NAME,
    PROTOCOL_PREFIX,
    TIMEOUT,
    MAX_INBOUND_STREAMS,
    MAX_OUTBOUND_STREAMS,
} from './constants.js';

export class PingService {
    constructor(components, init = {}) {
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
        this.log("incoming ping from %p", data.connection.remote);

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
                await sendAndReceive(stream, jsonString);
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

    async ping(addr, options = {}) {
        this.log("pinging %p", peer);
        let stream;
        let connection;
        try {
            const start = Date.now();
            const data = randomBytes(PING_LENGTH);
            connection = await this.components.connectionManager.openConnection(
                addr,
                options
            );
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

            const pingData = [0, 1, 2, 3, 4, 5, 6, 7];
            const jsonString = JSON.stringify(pingData);
            const result = await sendAndReceive(stream, jsonString);

            const ms = Date.now() - start;

            if (!this.isEquals(result, pingData)) {
                throw new ProtocolError(`Received wrong ping ack after ${ms}ms`);
            }

            this.log("ping %p complete in %dms", connection.remotePeer, ms);

            return ms;
        } catch (err) {
            this.log.error("error while pinging %p", peer, err);

            if (stream) {
                stream.abort(err);
            }

            throw err;
        } finally {
            if (stream) {
                await stream.close(options);
            }
        }
    }

    #isEquals(a, b) {
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