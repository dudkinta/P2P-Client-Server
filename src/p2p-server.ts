import { createLibp2p, Libp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { PeerId, Connection } from "@libp2p/interface";
import { Multiaddr } from "@multiformats/multiaddr";

import { loadOrCreatePeerId } from "./helpers/peer-helper.js";
import { LogLevel } from "./helpers/log-level.js";
import { ping } from "./services/ping/index.js";
import { roles } from "./services/roles/index.js";
import { peerList } from "./services/peer-list/index.js";
import { maList } from "./services/multiadress/index.js";
import ConfigLoader from "./helpers/config-loader.js";
import pkg from "debug";
const { debug } = pkg;

export class P2PServer {
  private config = ConfigLoader.getInstance().getConfig();
  private node: Libp2p | undefined;
  localPeerId: PeerId | undefined;
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    console.log(
      "p2p-server",
      `${level} [${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
    debug("p2p-server")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  localPeer: string | undefined;
  private port: number;
  private listenAddrs: string[];
  constructor(port: number, listenAddrs: string[]) {
    this.port = port;
    this.listenAddrs = listenAddrs;
  }

  private async createNode(): Promise<Libp2p | undefined> {
    try {
      const privateKey = await loadOrCreatePeerId("peer-id.bin");
      if (!privateKey) {
        this.log(LogLevel.Error, "Error loading or creating Peer ID");
        return undefined;
      }

      const addrs = this.listenAddrs.map(
        (addr: string) => `${addr}${this.port}`
      );
      const node = await createLibp2p({
        start: false,
        privateKey: privateKey,
        addresses: {
          listen: addrs,
        },
        transports: [tcp()],
        connectionGater: {
          denyDialMultiaddr: () => {
            return false;
          },
        },
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          relay: circuitRelayServer({
            maxInboundHopStreams: 512,
            maxOutboundStopStreams: 515,
            reservations: {
              maxReservations: 512,
              defaultDurationLimit: 600000,
              defaultDataLimit: BigInt(1 << 24),
            },
          }),
          aminoDHT: kadDHT({
            clientMode: false,
            allowQueryWithZeroPeers: true,
            peerInfoMapper: removePrivateAddressesMapper,
          }),
          identify: identify(),
          identifyPush: identifyPush(),
          ping: ping(),
          roles: roles({
            roles: [this.config.roles.RELAY],
          }),
          peerList: peerList(),
          maList: maList(),
        },
        connectionManager: {
          maxConnections: 128,
        },
      });
      return node;
    } catch (error) {
      this.log(LogLevel.Error, `Error during createLibp2p: ${error}`);
      return undefined;
    }
  }
  async connectTo(ma: Multiaddr): Promise<Connection | undefined> {
    const signal = AbortSignal.timeout(5000);
    try {
      if (!this.node) {
        return undefined;
      }
      this.log(LogLevel.Info, `Connecting to ${ma.toString()}`);
      const conn = await this.node.dial(ma, { signal });
      if (conn) {
        this.log(
          LogLevel.Info,
          `Connect to ${conn.remoteAddr.toString()} Status: ${conn.status}`
        );
      }
      return conn;
    } catch (error) {
      this.log(LogLevel.Error, `Error in connectTo ${JSON.stringify(error)}`);
      return undefined;
    }
  }
  async startNode(): Promise<void> {
    try {
      this.node = await this.createNode();
      if (!this.node) {
        this.log(LogLevel.Error, "Node is not initialized");
        return;
      }
      this.localPeerId = this.node.peerId;
      this.node.addEventListener("start", (event: any) => {
        this.log(LogLevel.Info, "Libp2p node started");
      });

      await this.node.start();
      this.localPeer = this.node.peerId.toString();
      this.log(LogLevel.Info, `Local peer ID: ${this.localPeer}`);
      this.log(LogLevel.Info, `Libp2p listening on:`);

      this.node.getMultiaddrs().forEach((ma) => {
        this.log(LogLevel.Info, `${ma.toString()}`);
      });
    } catch (err: any) {
      this.log(LogLevel.Error, `Error on start server node - ${err}`);
    }
  }
}
