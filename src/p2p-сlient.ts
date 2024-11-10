import { EventEmitter } from "events";
import { createLibp2p, Libp2p } from "libp2p";
import { TimeoutError, type Connection, type PeerId } from "@libp2p/interface";
import { ping, PingService } from "./services/ping/index.js";
import { roles, RolesService } from "./services/roles/index.js";
import { peerList, PeerListService } from "./services/peer-list/index.js";
import { maList, MultiaddressService } from "./services/multiadress/index.js";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { identify, identifyPush } from "@libp2p/identify";
import { Multiaddr, multiaddr } from "@multiformats/multiaddr";
import ConfigLoader from "./helpers/config-loader.js";
import pkg from "debug";
const { debug } = pkg;
export interface ConnectionOpenEvent {
  peerId: PeerId;
  conn: Connection;
}

export class P2PClient extends EventEmitter {
  private node: Libp2p | undefined;
  private config: any;
  private log = debug("p2p-client");
  localPeer: string | undefined;
  constructor() {
    super();
    this.config = ConfigLoader.getInstance().getConfig();
  }

  private async createNode(): Promise<Libp2p | undefined> {
    try {
      const port = this.config.port ?? 0;
      let listenAddrs: string[] = this.config.listen ?? ["/ip4/0.0.0.0/tcp/"];
      listenAddrs = listenAddrs.map((addr: string) => `${addr}${port}/ws`);
      listenAddrs.push("/p2p-circuit");
      const node = await createLibp2p({
        start: false,
        addresses: {
          listen: listenAddrs,
        },
        transports: [
          webSockets({
            filter: filters.all,
          }),
          circuitRelayTransport({
            maxInboundStopStreams: 500,
            maxOutboundStopStreams: 500,
            stopTimeout: 60000,
            reservationCompletionTimeout: 20000,
          }),
        ],
        connectionGater: {
          denyDialMultiaddr: () => {
            return false;
          },
        },
        connectionEncrypters: [noise()],
        //streamMuxers: [yamux()],
        services: {
          aminoDHT: kadDHT({
            clientMode: true,
            protocol: "/ipfs/kad/1.0.0",
            peerInfoMapper: removePrivateAddressesMapper,
          }),
          identify: identify(),
          identifyPush: identifyPush(),
          ping: ping(),
          roles: roles({
            roles: [this.config.roles.NODE],
          }),
          peerList: peerList(),
          maList: maList(),
        },
        connectionManager: {
          maxConnections: 20,
        },
      });
      return node;
    } catch (error) {
      this.log(`Error during createLibp2p: ${error}`);
      return undefined;
    }
  }

  async pingByAddress(peerAddress: string): Promise<number> {
    if (!this.node) {
      throw new Error("Node is not initialized for ping");
    }
    try {
      const addr = multiaddr(peerAddress);
      const ping = this.node.services.ping as PingService;
      this.log(`Пингуем ${peerAddress}`);
      const latency = await ping.ping(addr);
      this.log(`Пинг ${peerAddress}: ${latency}ms`);
      return latency;
    } catch (error) {
      this.log("Ошибка при пинге:", error);
      if (error instanceof TimeoutError) {
        this.log("Ошибка таймаута при пинге:", error);
      }
      throw error;
    }
  }

  async getRolesByAddress(conn: Connection): Promise<string> {
    if (!this.node) {
      throw new Error("Node is not initialized for getRoles");
    }
    try {
      const roleService = this.node.services.roles as RolesService;
      const result = await roleService.roles(conn, {
        signal: AbortSignal.timeout(5000),
      });
      this.log(`Роли пира (${conn.remotePeer.toString()}): ${result}`);
      return result;
    } catch (error) {
      this.log("Ошибка при запросе ролей:", error);
      if (error instanceof TimeoutError) {
        this.log("Ошибка таймаута при запросе ролей:", error);
      }
      throw error;
    }
  }

  async getPeerList(conn: Connection): Promise<string> {
    if (!this.node) {
      throw new Error("Node is not initialized for getPeerList");
    }
    try {
      const peerListService = this.node.services.peerList as PeerListService;
      const result = await peerListService.getConnectedPeers(conn, {
        signal: AbortSignal.timeout(5000),
      });
      this.log(
        `Подключенные пиры к пиру: (${conn.remotePeer.toString()}): ${result}`
      );
      return result;
    } catch (error) {
      this.log("Ошибка при запросе подключеных пиров:", error);
      if (error instanceof TimeoutError) {
        this.log("Ошибка таймаута при запросе подключеных пиров:", error);
      }
      throw error;
    }
  }

  async getMultiaddresses(conn: Connection): Promise<string> {
    if (!this.node) {
      throw new Error("Node is not initialized for getMultiaddresses");
    }
    try {
      const maListService = this.node.services.maList as MultiaddressService;
      const result = await maListService.getMultiaddress(conn, {
        signal: AbortSignal.timeout(5000),
      });
      this.log(`Мультиадреса пира: (${conn.remotePeer.toString()}): ${result}`);
      return result;
    } catch (error) {
      this.log("Ошибка при запросе мультиадресов:", error);
      if (error instanceof TimeoutError) {
        this.log("Ошибка таймаута при запросе мультиадресов:", error);
      }
      throw error;
    }
  }

  async connectTo(ma: Multiaddr): Promise<Connection | undefined> {
    const signal = AbortSignal.timeout(5000);
    try {
      if (!this.node) {
        return undefined;
      }
      this.log(`Connecting to ${ma.toString()}`);
      const conn = await this.node.dial(ma, { signal });
      if (conn) {
        this.log(
          `Connect to ${conn.remoteAddr.toString()} Status: ${conn.status}`
        );
      }
      return conn;
    } catch (error) {
      this.log("Error in connectTo");
      this.log(error);
      return undefined;
    }
  }

  async disconnectFromMA(ma: Multiaddr): Promise<void> {
    if (!this.node) {
      return;
    }
    const signal = AbortSignal.timeout(5000);
    try {
      this.log(`Disconnecting from ${ma.toString()}`);
      await this.node.hangUp(ma, { signal });
      this.log(`Disconnected from ${ma.toString()}`);
    } catch (error) {
      this.log("Error in disconnectFromMA: ", error);
    }
  }

  async startNode(): Promise<void> {
    try {
      this.node = await this.createNode();
      if (!this.node) {
        this.log("Node is not initialized");
        return;
      }

      this.localPeer = this.node.peerId.toString();
      this.node.addEventListener("connection:open", (event: any) => {
        this.log(
          `Connection open to PeerId: ${event.detail.remotePeer.toString()} Address: ${event.detail.remoteAddr.toString()}`
        );
        this.emit("connection:open", event.detail);
      });
      this.node.addEventListener("connection:close", (event: any) => {
        const conn: Connection = event.detail;
        const peerId: PeerId = conn.remotePeer;
        this.emit("connection:close", { peerId, conn });
      });
      this.node.addEventListener("peer:connect", (event: any) => {
        const peerId = event.detail;
        if (peerId) {
          this.emit("peer:connect", peerId);
        }
      });
      this.node.addEventListener("peer:disconnect", (event: any) => {
        const peerId = event.detail;
        if (peerId) {
          this.emit("peer:disconnect", peerId);
        }
      });
      this.node.addEventListener("peer:update", (event: any) => {
        const protocols = event.detail.peer.protocols;
        const peerId: PeerId = event.detail.peer.id;
        if (protocols && peerId) {
          this.emit("updateProtocols", { peerId, protocols });
        }
      });
      this.node.addEventListener("start", (event: any) => {
        this.log("Libp2p node started");
      });

      await this.node.start();
      this.log(`Libp2p listening on:`);
      this.node.getMultiaddrs().forEach((ma) => {
        this.log(`${ma.toString()}`);
      });
    } catch (err: any) {
      this.log(`Error on start client node - ${err}`);
    }
  }
}
