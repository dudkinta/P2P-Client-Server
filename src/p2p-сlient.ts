import { EventEmitter } from "events";
import { createLibp2p, Libp2p } from "libp2p";
import { TimeoutError, type Connection, type PeerId } from "@libp2p/interface";
import { ping, PingService } from "./services/ping/index.js";
import { roles, RolesService } from "./services/roles/index.js";
import { peerList, PeerListService } from "./services/peer-list/index.js";
import { maList, MultiaddressService } from "./services/multiadress/index.js";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { tcp } from "@libp2p/tcp";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { identify, identifyPush } from "@libp2p/identify";
import { Multiaddr, multiaddr } from "@multiformats/multiaddr";
import ConfigLoader from "./helpers/config-loader.js";
import { sendDebug } from "./services/socket-service.js";
import { LogLevel } from "./helpers/log-level.js";
import { loadOrCreatePeerId } from "./helpers/peer-helper.js";
import pkg from "debug";
const { debug } = pkg;
export interface ConnectionOpenEvent {
  peerId: PeerId;
  conn: Connection;
}

export class P2PClient extends EventEmitter {
  private config = ConfigLoader.getInstance().getConfig();
  private node: Libp2p | undefined;
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("p2p-client", level, timestamp, message);
    debug("p2p-client")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  localPeer: string | undefined;
  localPeerId: PeerId | undefined;
  private port: number;
  private listenAddrs: string[];
  constructor(port: number, listenAddrs: string[]) {
    super();
    this.port = port;
    this.listenAddrs = listenAddrs;
  }

  private async createNode(): Promise<Libp2p | undefined> {
    try {
      const privateKey = await loadOrCreatePeerId("./data/peer-id.bin");
      if (!privateKey) {
        this.log(LogLevel.Error, "Error loading or creating Peer ID");
        return undefined;
      }

      const addrs = this.listenAddrs.map(
        (addr: string) => `${addr}${this.port}`
      );
      addrs.push("/p2p-circuit");
      const node = await createLibp2p({
        start: false,
        privateKey: privateKey,
        addresses: {
          listen: addrs,
        },
        transports: [
          tcp(),
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
        streamMuxers: [yamux()],
        services: {
          aminoDHT: kadDHT({
            allowQueryWithZeroPeers: true,
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
          maxConnections: 128,
        },
      });
      return node;
    } catch (error) {
      this.log(LogLevel.Critical, `Error during createLibp2p: ${error}`);
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
      this.log(LogLevel.Info, `Пингуем ${peerAddress}`);
      const latency = await ping.ping(addr);
      this.log(LogLevel.Info, `Пинг ${peerAddress}: ${latency}ms`);
      return latency;
    } catch (error) {
      this.log(LogLevel.Error, `Ошибка при пинге: ${JSON.stringify(error)}`);
      if (error instanceof TimeoutError) {
        this.log(
          LogLevel.Error,
          `Ошибка таймаута при пинге: ${JSON.stringify(error)}`
        );
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
      this.log(
        LogLevel.Info,
        `Роли пира (${conn.remotePeer.toString()}): ${result}`
      );
      return result;
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Ошибка при запросе ролей: ${JSON.stringify(error)}`
      );
      if (error instanceof TimeoutError) {
        this.log(
          LogLevel.Error,
          `Ошибка таймаута при запросе ролей: ${JSON.stringify(error)}`
        );
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
        LogLevel.Info,
        `Подключенные пиры к пиру: (${conn.remotePeer.toString()}): ${result}`
      );
      return result;
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Ошибка при запросе подключеных пиров: ${JSON.stringify(error)}`
      );
      if (error instanceof TimeoutError) {
        this.log(
          LogLevel.Error,
          `Ошибка таймаута при запросе подключеных пиров: ${JSON.stringify(error)}`
        );
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
      this.log(
        LogLevel.Info,
        `Мультиадреса пира: (${conn.remotePeer.toString()}): ${result}`
      );
      return result;
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Ошибка при запросе мультиадресов: ${JSON.stringify(error)}`
      );
      if (error instanceof TimeoutError) {
        this.log(
          LogLevel.Error,
          `Ошибка таймаута при запросе мультиадресов: ${JSON.stringify(error)}`
        );
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

  async disconnectFromMA(ma: Multiaddr): Promise<void> {
    if (!this.node) {
      return;
    }
    const signal = AbortSignal.timeout(5000);
    try {
      this.log(LogLevel.Info, `Disconnecting from ${ma.toString()}`);
      await this.node.hangUp(ma, { signal });
      this.log(LogLevel.Info, `Disconnected from ${ma.toString()}`);
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Error in disconnectFromMA: ${JSON.stringify(error)}`
      );
    }
  }

  async startNode(): Promise<void> {
    try {
      this.node = await this.createNode();
      if (!this.node) {
        this.log(LogLevel.Error, "Node is not initialized");
        return;
      }

      this.localPeer = this.node.peerId.toString();
      this.localPeerId = this.node.peerId;
      this.node.addEventListener("connection:open", (event: any) => {
        this.log(
          LogLevel.Info,
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
        this.log(LogLevel.Info, "Libp2p node started");
      });

      await this.node.start();
      this.log(LogLevel.Info, `Libp2p listening on:`);
      this.node.getMultiaddrs().forEach((ma) => {
        this.log(LogLevel.Info, `${ma.toString()}`);
      });
    } catch (err: any) {
      this.log(LogLevel.Error, `Error on start client node - ${err}`);
    }
  }
}
