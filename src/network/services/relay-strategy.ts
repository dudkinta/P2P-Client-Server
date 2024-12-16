import pkg from "debug";
const { debug } = pkg;
import {
  sendDebug as SendLogToSocket,
  sendNodes as SendNodesToSocket,
} from "./socket-service.js";
import { LogLevel } from "../helpers/log-level.js";
import {
  IStrategy,
  type RequestConnect,
  type RequestDisconnect,
  type RequestConnectedPeers,
  type RequestMultiaddrs,
  type RequestRoles,
  type RequestStoreData,
} from "./network-service.js";
import { Node } from "..//models/node.js";
import { Connection, PeerId } from "@libp2p/interface";
import { ConfigLoader } from "../../common/config-loader.js";
import { multiaddr } from "@multiformats/multiaddr";
import e from "express";

export class RelayStrategy extends Map<string, Node> implements IStrategy {
  private config = ConfigLoader.getInstance();
  private requestConnect: RequestConnect;
  private requestDisconnect: RequestDisconnect;
  private requestRoles: RequestRoles;
  private requestMultiaddrs: RequestMultiaddrs;
  private requestConnectedPeers: RequestConnectedPeers;
  private requestStoreData: RequestStoreData;
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    SendLogToSocket("relay-strategy", level, timestamp, message);
    debug("relay-strategy")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  private PeerId: PeerId | undefined;
  private banList: Set<string> = new Set();
  constructor(
    requestConnect: RequestConnect,
    requestDisconnect: RequestDisconnect,
    requestRoles: RequestRoles,
    requestMultiaddrs: RequestMultiaddrs,
    requestConnectedPeers: RequestConnectedPeers,
    requestStoreData: RequestStoreData
  ) {
    super();
    this.requestConnect = requestConnect;
    this.requestDisconnect = requestDisconnect;
    this.requestRoles = requestRoles;
    this.requestMultiaddrs = requestMultiaddrs;
    this.requestConnectedPeers = requestConnectedPeers;
    this.requestStoreData = requestStoreData;
  }

  set(key: string, value: Node): this {
    super.set(key, value);
    this.log(
      LogLevel.Info,
      `Node ${key} added to storage. Direction: ${value.getOpenedConnection()?.direction}`
    );
    this.startNodeStrategy(key, value);
    return this;
  }

  async startStrategy(localPeer: PeerId): Promise<void> {
    this.log(LogLevel.Info, `Starting global strategy`);
    this.PeerId = localPeer;
    await this.connectToMainRelay().catch((error) => {
      this.log(LogLevel.Error, `Error in promise connectToMainRelay: ${error}`);
    });
    setTimeout(async () => {
      await this.selfDiag();
    }, 10000);
    setTimeout(async () => {
      await this.sendToSocket();
    }, 0);
  }

  async stopNodeStrategy(
    key: string,
    cause: string,
    banTimer: number
  ): Promise<void> {
    this.log(
      LogLevel.Info,
      `Stopping node strategy for ${key}. Cause: ${cause}`
    );
    const node = this.get(key);
    if (!node) {
      return;
    }
    node.connections.forEach(async (conn) => {
      if (conn.status != "closed") {
        await this.requestDisconnect(conn.remoteAddr.toString()).catch(
          (error) => {
            this.log(
              LogLevel.Error,
              `Error in promise requestDisconnect: ${error}`
            );
          }
        );
      }
    });
    this.log(LogLevel.Info, `Ban Node ${key} on ${banTimer} ms`);
    this.banList.add(key);
    setTimeout(() => {
      this.log(LogLevel.Info, `Unban Node ${key}`);
      this.banList.delete(key);
    }, banTimer);
    this.delete(key);
    this.log(LogLevel.Warning, `Node ${key} removed from storage`);
  }

  getRoot(): { root: Node; connections: Connection[] } | undefined {
    if (!this.PeerId) {
      return undefined;
    }
    const rootNode = new Node(this.PeerId, undefined);
    rootNode.isRoot = true;
    const openConnections = Array.from(this.values())
      .map((node) => {
        return node.getOpenedConnection();
      })
      .filter((conn) => conn != undefined);
    return { root: rootNode, connections: openConnections };
  }

  private async sendToSocket(): Promise<void> {
    const nodes = Array.from(this.values());
    SendNodesToSocket(nodes);
    setTimeout(async () => {
      await this.sendToSocket();
    }, 1000);
  }

  private async connectToMainRelay(): Promise<void> {
    if (this.config.getRelays().length === 0) {
      this.log(LogLevel.Critical, `No relay in knowsRelay`);
      return;
    }

    this.config.getRelays().forEach((relay) => {
      const ma = multiaddr(relay);
      if (ma && ma.getPeerId() !== this.PeerId?.toString()) {
        this.requestConnect(ma.toString()).catch((error) => {
          this.log(
            LogLevel.Error,
            `Error in promise connectToMainRelay: ${error}`
          );
        });
      }
    });
  }

  private async startNodeStrategy(key: string, node: Node): Promise<void> {
    this.log(LogLevel.Info, `Starting node strategy for ${key}`);
    await this.waitConnect(node).catch((error) => {
      this.log(LogLevel.Error, `Error in promise waitConnect: ${error}`);
    });
    const connection = node.getOpenedConnection();
    if (!connection) {
      await this.stopNodeStrategy(key, `not found opened connection`, 5000);
      this.log(LogLevel.Warning, `Node ${key} is not connected. Self remove`);
      return;
    }
    this.log(
      LogLevel.Info,
      `Node ${key} is connected. Direction: ${connection.direction}`
    );
    await this.waitRoles(node).catch((error) => {
      this.log(LogLevel.Error, `Error in promise waitRoles: ${error}`);
    });
    if (connection.direction == "outbound" && node.roles.size == 0) {
      await this.stopNodeStrategy(key, `in outbound connection no roles`, 5000);
    }
    node.roles.forEach((role) => {
      this.log(LogLevel.Info, `Node ${key} has role:${role}`);
    });
    this.log(
      LogLevel.Info,
      `Node ${key} with direction:${connection.direction} is ready`
    );
  }

  private async waitRoles(node: Node): Promise<void> {
    try {
      let countDelay = 0;
      while (node.roles.size == 0 && countDelay < 10) {
        this.log(LogLevel.Info, `Waiting for roles`);
        await this.getRoles(node).catch((error) => {
          this.log(LogLevel.Error, `Error in promise getRoles: ${error}`);
        });
        if (node.roles.size == 0) {
          await this.delay(500);
        }
        countDelay++;
      }
    } catch (error) {
      this.log(LogLevel.Error, `Error in waitConnect: ${error}`);
    }
  }

  private async waitConnect(node: Node): Promise<void> {
    try {
      let countDelay = 0;
      while (!node.isConnect() && countDelay < 10) {
        this.log(LogLevel.Info, `Waiting for connect`);
        await this.delay(500);
        countDelay++;
      }
    } catch (error) {
      this.log(LogLevel.Error, `Error in waitConnect: ${error}`);
    }
  }

  private async getRoles(node: Node): Promise<void> {
    try {
      let roles: string[] | undefined;
      roles = await this.requestRoles(node).catch((error) => {
        this.log(LogLevel.Error, `Error in promise getRoles: ${error}`);
        return undefined;
      });
      if (roles != undefined) {
        roles.forEach((role) => {
          node.roles.add(role);
        });
      }
    } catch (error) {
      this.log(LogLevel.Error, `Error in getRoles: ${error}`);
    }
  }

  private async delay(ms: number): Promise<void> {
    try {
      return new Promise((resolve) => setTimeout(resolve, ms));
    } catch (error) {
      this.log(LogLevel.Error, `Error in delay: ${error}`);
    }
  }

  private async selfDiag(): Promise<void> {
    //удаление закрытых соединений
    for (const [key, node] of this) {
      if (!node) {
        continue;
      }
      if (node.connections.size == 0) {
        continue;
      }
      node.connections.forEach((conn) => {
        if (conn.status == "closed") {
          node.connections.delete(conn);
        }
      });
    }

    //проверка наличия соединений у реле
    this.config.getRelays().forEach((relay) => {
      const ma = multiaddr(relay);
      const peerId = ma.getPeerId();
      if (ma && peerId && peerId !== this.PeerId?.toString()) {
        const relayNode = this.get(peerId);
        if (relayNode) {
          const connection = relayNode.getOpenedConnection();
          if (!connection) {
            this.requestConnect(ma.toString()).catch((error) => {
              this.log(
                LogLevel.Error,
                `Error in promise connectToMainRelay: ${error}`
              );
            });
          }
        } else {
          this.requestConnect(ma.toString()).catch((error) => {
            this.log(
              LogLevel.Error,
              `Error in promise connectToMainRelay: ${error}`
            );
          });
        }
      }
    });
    setTimeout(async () => {
      await this.selfDiag();
    }, 10000);
  }
}
