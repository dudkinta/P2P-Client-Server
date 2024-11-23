import { EventEmitter } from "events";
import { Libp2p } from "libp2p";
import { TimeoutError, Connection, PeerId } from "@libp2p/interface";
import { RolesService } from "./services/roles/index.js";
import { PeerListService } from "./services/peer-list/index.js";
import { MultiaddressService } from "./services/multiadress/index.js";
import { Multiaddr } from "@multiformats/multiaddr";
import ConfigLoader from "./helpers/config-loader.js";
import { sendDebug } from "./services/socket-service.js";
import { LogLevel } from "./helpers/log-level.js";
import pkg from "debug";
import { getNodeClient, getRelayClient } from "./helpers/libp2p-helper.js";
import {
  StoreService,
  RequestStore,
  StoreItem,
} from "./services/store/index.js";
const { debug } = pkg;
export interface ConnectionOpenEvent {
  peerId: PeerId;
  conn: Connection;
}

export class P2PClient extends EventEmitter {
  private config = ConfigLoader.getInstance().getConfig();
  private node: Libp2p | undefined;
  private useWebsockets: boolean = false;
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    if (this.useWebsockets) {
      sendDebug("p2p-client", level, timestamp, message);
    } else {
      console.log(
        `${level} [${timestamp.toISOString().slice(11, 23)}] ${message}`
      );
    }
    debug("p2p-client")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  localPeerId: PeerId | undefined;
  private port: number;
  private listenAddrs: string[];
  private mainRole: string;
  constructor(listenAddrs: string[], port: number, role: string) {
    super();
    this.port = port;
    this.listenAddrs = listenAddrs;
    this.mainRole = role;
    const argv = process.argv.slice(2);
    if (role == this.config.roles.NODE && !argv.includes("--no-webserver")) {
      this.useWebsockets = true;
    }
  }

  private async createNode(): Promise<Libp2p | undefined> {
    try {
      if (this.mainRole === this.config.roles.NODE) {
        return await getNodeClient(this.listenAddrs, this.port).catch((err) => {
          this.log(LogLevel.Error, `Error in getNodeClient: ${err}`);
          return undefined;
        });
      }
      if (this.mainRole === this.config.roles.RELAY) {
        return await getRelayClient(this.listenAddrs, this.port).catch(
          (err) => {
            this.log(LogLevel.Error, `Error in getRelayClient: ${err}`);
            return undefined;
          }
        );
      }
      return undefined;
    } catch (error) {
      this.log(LogLevel.Critical, `Error during createNode: ${error}`);
      return undefined;
    }
  }

  async getRolesByAddress(conn: Connection): Promise<string> {
    if (!this.node) {
      throw new Error("Node is not initialized for getRoles");
    }
    try {
      const roleService = this.node.services.roles as RolesService;
      const result = await roleService
        .roles(conn, {
          signal: AbortSignal.timeout(5000),
        })
        .catch((err) => {
          this.log(LogLevel.Error, `Error in getRoles: ${err}`);
          throw err;
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
      const result = await peerListService
        .getConnectedPeers(conn, {
          signal: AbortSignal.timeout(5000),
        })
        .catch((err) => {
          this.log(LogLevel.Error, `Error in getPeerList: ${err}`);
          throw err;
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

  getStore(request: RequestStore): StoreItem[] {
    if (!this.node) {
      throw new Error("Node is not initialized for getStore");
    }
    const storeService = this.node.services.store as StoreService;
    if (!storeService) {
      throw new Error("Store service is not initialized");
    }
    try {
      const result = storeService.getStore(request);
      this.log(LogLevel.Debug, `Store: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Ошибка при запросе store: ${JSON.stringify(error)}`
      );
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
      await this.node.hangUp(ma, { signal }).catch((err) => {
        this.log(LogLevel.Error, `Error in hangUp: ${err}`);
        throw err;
      });
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
      this.localPeerId = this.node.peerId;
      const maService = this.node.services.maList as MultiaddressService;
      if (maService) {
        const maList = await maService.getDirectMultiaddress();
        maList.forEach((ma) => {
          this.log(LogLevel.Info, `${ma.toString()}`);
        });
        if (maList.length > 0) {
          const storeService = this.node.services.store as StoreService;
          if (storeService) {
            storeService.putStore({
              peerId: this.node.peerId.toString(),
              key: "DirectAddresses",
              type: "string[]",
              value: maList,
              ttl: 60000 * 60,
              dt: Date.now(),
              recieved: Date.now(),
            });
          }
        }
      } else {
        this.log(LogLevel.Warning, "No multiaddress service found");
      }
    } catch (err: any) {
      this.log(LogLevel.Error, `Error on start client node - ${err}`);
    }
  }
}
