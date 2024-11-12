import { Node } from "../models/node.js";
import ConfigLoader from "../helpers/config-loader.js";
import { isLocalAddress, isDirect, isRelay } from "../helpers/check-ip.js";
import { Connection } from "@libp2p/interface";
import pkg from "debug";
import { multiaddr } from "@multiformats/multiaddr";
import { sendDebug } from "./socket-service.js";
import { LogLevel } from "../helpers/log-level.js";

const { debug } = pkg;
type RequestConnect = (addrr: string) => Promise<Connection | undefined>;
type RequestDisconnect = (addrr: string) => Promise<void>;
type RequestRoles = (node: Node) => Promise<string[] | undefined>;
type RequestMultiaddrs = (node: Node) => Promise<string[] | undefined>;
type RequestConnectedPeers = (
  node: Node
) => Promise<Map<string, string> | undefined>;
type RequestPing = (addrr: string) => Promise<number | undefined>;
export class NodeStrategy extends Map<string, Node> {
  private config = ConfigLoader.getInstance().getConfig();
  private relayCount: number = 0;
  private nodeCount: number = 0;
  private unknownCount: number = 0;
  private penaltyNodes: string[] = [];
  private candidatePeers: Map<string, string> = new Map();
  private banList: Set<string> = new Set();
  private banDirectAddress: Set<string> = new Set();
  private requestConnect: RequestConnect;
  private requestDisconnect: RequestDisconnect;
  private requestRoles: RequestRoles;
  private requestMultiaddrs: RequestMultiaddrs;
  private requestConnectedPeers: RequestConnectedPeers;
  private requestPing: RequestPing;

  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    sendDebug("node-strategy", level, `[${timestamp}] ${message}`);
    debug("node-strategy")(`[${timestamp}] ${message}`);
  };
  private localPeer: string | undefined;

  constructor(
    requestConnect: RequestConnect,
    requestDisconnect: RequestDisconnect,
    requestRoles: RequestRoles,
    requestMultiaddrs: RequestMultiaddrs,
    requestConnectedPeers: RequestConnectedPeers,
    requestPing: RequestPing
  ) {
    super();
    this.requestConnect = requestConnect;
    this.requestDisconnect = requestDisconnect;
    this.requestRoles = requestRoles;
    this.requestMultiaddrs = requestMultiaddrs;
    this.requestConnectedPeers = requestConnectedPeers;
    this.requestPing = requestPing;
    debug.enable("node-strategy");
  }

  set(key: string, value: Node): this {
    super.set(key, value);
    this.log(LogLevel.Info, `Node ${key} added to storage`);
    this.startNodeStrategy(key, value);
    return this;
  }

  async startStrategy(localPeer: string): Promise<void> {
    this.log(LogLevel.Info, `Starting global strategy`);
    this.localPeer = localPeer;
    await this.connectToMainRelay().catch((error) => {
      this.log(LogLevel.Error, `Error in promise connectToMainRelay: ${error}`);
    });
    setTimeout(async () => {
      await this.selfDiag();
    }, 10000);
  }

  private async connectToMainRelay(): Promise<void> {
    const relay = this.config.relay[0];
    const address = `/ip4/${relay.ADDRESS}/tcp/${relay.PORT}/p2p/${relay.PEER}`;
    const connRelay = await this.tryConnect(address).catch((error) => {
      this.log(LogLevel.Error, `Error in promise requestConnect: ${error}`);
    });
    if (!connRelay) {
      this.log(LogLevel.Warning, `Relay not connected`);
      return;
    }
  }

  private async selfDiag(): Promise<void> {
    this.removeDeadNodes();
    this.counterConnections();
    // если никого нет, то подключаемся к релейному узлу
    if (this.size == 0) {
      this.log(LogLevel.Warning, `No nodes in storage`);
      this.banList.clear();
      await this.connectToMainRelay().catch((error) => {
        this.log(
          LogLevel.Error,
          `Error in promise connectToMainRelay: ${error}`
        );
      });
    }

    // проверяем лимиты на соединениях
    for (const [key, node] of this) {
      if (!node) {
        continue;
      }
      const connection = node.getOpenedConnection();
      if (!connection) {
        continue;
      }
      if (!connection.limits) {
        continue;
      }

      if (connection.limits.bytes && connection.limits.bytes <= 1024) {
        await this.stopNodeStrategy(
          key,
          `connection limit bytes: ${connection.limits.bytes}`,
          5000
        ).catch((error) => {
          this.log(
            LogLevel.Error,
            `Error in promise stopNodeStrategy: ${error}`
          );
        });
      }
      this.log(
        LogLevel.Info,
        `Limits connection ${connection.remoteAddr.toString()} \r\nLimits bytes:${connection.limits.bytes}  Limits second:${connection.limits.seconds}`
      );
    }

    // обновляем список кандидатов
    for (const [key, node] of this) {
      await this.getConnectedPeers(node).catch((error) => {
        this.log(
          LogLevel.Error,
          `Error in promise getConnectedPeers: ${error}`
        );
      });
    }

    // тест кандидатов и подключение к ним
    for (const [key, address] of this.candidatePeers) {
      if (this.has(key)) {
        continue;
      }
      if (this.size >= this.config.MAX_NODES) {
        this.log(
          LogLevel.Info,
          `Max nodes limit reached. Current nodes: ${this.size}, Max nodes: ${this.config.MAX_NODES}`
        );
        break;
      }

      await this.tryConnect(address).catch((error) => {
        this.log(LogLevel.Error, `Error in promise requestConnect: ${error}`);
        return undefined;
      });
    }

    // поиск прямых адресов у пиров
    for (const [key, node] of this) {
      if (!node) {
        continue;
      }
      const connection = node.getOpenedConnection();
      if (!connection) {
        continue;
      }

      if (node.roles.has(this.config.roles.NODE)) {
        const directAddresses = Array.from(node.addresses).find((address) => {
          return (
            !this.banDirectAddress.has(address) &&
            isDirect(address) &&
            !isLocalAddress(address) &&
            connection.remoteAddr.toString() != address
          );
        });
        if (directAddresses) {
          await this.stopNodeStrategy(key, `found direct address`, 0);
          setTimeout(async () => {
            this.log(
              LogLevel.Info,
              `Try connect to direct address ${directAddresses}`
            );
            const conn = await this.tryConnect(directAddresses).catch(
              (error) => {
                this.log(
                  LogLevel.Error,
                  `Error in promise requestConnect: ${error}`
                );
              }
            );
            if (!conn || conn.status != "open") {
              this.log(
                LogLevel.Warning,
                `Ban direct address ${directAddresses}`
              );
              this.banDirectAddress.add(directAddresses);
            }
          }, 500);
        }
      }
    }

    //отключение от релейных узлов если достаточно подключенных нод
    if (this.size > 5) {
      const relayNodes = Array.from(this.values()).filter((node) => {
        node.roles.has(this.config.roles.RELAY) &&
          !node.roles.has(this.config.roles.NODE);
      });
      relayNodes.forEach(async (node) => {
        if (!node || !node.peerId) {
          return;
        }
        await this.stopNodeStrategy(
          node.peerId.toString(),
          `too many connected nodes`,
          60 * 1000 * 5
        );
      });
    }

    setTimeout(async () => {
      await this.selfDiag();
    }, 10000);
  }

  private removeDeadNodes() {
    for (const [key, node] of this) {
      if (!node) {
        this.log(
          LogLevel.Warning,
          `Add penalty for Node ${key}. Node is not found`
        );
        this.penaltyNodes.push(key);
        continue;
      }
      const connection = node.getOpenedConnection();
      if (!connection) {
        this.log(
          LogLevel.Warning,
          `Add penalty for Node ${key}. Connection is not found`
        );
        this.penaltyNodes.push(key);
        continue;
      }
      if (connection.direction == "outbound" && node.roles.size == 0) {
        this.log(LogLevel.Warning, `Add penalty for Node ${key}. No roles`);
        this.penaltyNodes.push(key);
        continue;
      }
    }
    const keysForDelete = [
      ...this.penaltyNodes.reduce(
        (map, node) => map.set(node, (map.get(node) || 0) + 1),
        new Map()
      ),
    ]
      .filter(([, count]) => count > 4)
      .map(([node]) => node);

    keysForDelete.forEach((key) => {
      this.log(LogLevel.Warning, `NetworkStrategy-> Delete node: ${key}`);
      this.delete(key);
    });
    this.penaltyNodes = this.penaltyNodes.filter(
      (node) => !keysForDelete.includes(node)
    );
  }

  private counterConnections(): void {
    let rCount = 0;
    let nCount = 0;
    let uCount = 0;
    let inBoundCount = 0;
    let ouBboundCount = 0;
    let relayConnections = 0;
    let directConnections = 0;
    for (const [key, node] of this) {
      if (!node) {
        uCount++;
        continue;
      }
      const connection = node.getOpenedConnection();
      if (!connection) {
        uCount++;
        continue;
      }
      if (connection.direction == "inbound") {
        inBoundCount++;
      }
      if (connection.direction == "outbound") {
        ouBboundCount++;
      }

      if (node.roles.has(this.config.roles.RELAY)) {
        rCount++;
      }
      if (node.roles.has(this.config.roles.NODE)) {
        nCount++;
      }
      if (
        !node.roles.has(this.config.roles.RELAY) &&
        !node.roles.has(this.config.roles.NODE)
      ) {
        uCount++;
      }
      if (isDirect(connection.remoteAddr.toString())) {
        directConnections++;
      }
      if (isRelay(connection.remoteAddr.toString())) {
        relayConnections++;
      }
    }
    this.relayCount = rCount;
    this.nodeCount = nCount;
    this.unknownCount = uCount;

    this.log(
      LogLevel.Info,
      `Counter --> Relay count: ${this.relayCount}, Node count: ${this.nodeCount}, Unknown count: ${this.unknownCount}`
    );
    this.log(
      LogLevel.Info,
      `Counter --> Inbouund count: ${inBoundCount}, Outbound count: ${ouBboundCount}`
    );
    this.log(
      LogLevel.Info,
      `Counter --> Direct connections: ${directConnections}, Relay connections: ${relayConnections}`
    );
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

  private async startNodeStrategy(key: string, node: Node): Promise<void> {
    if (this.candidatePeers.has(key)) {
      this.candidatePeers.delete(key);
    }
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
    if (node.roles.has(this.config.roles.NODE)) {
      await this.waitMultiaddrs(node).catch((error) => {
        this.log(LogLevel.Error, `Error in promise waitMultiaddrs: ${error}`);
      });
      if (connection.direction == "outbound" && node.addresses.size == 0) {
        await this.stopNodeStrategy(
          key,
          `in outbound connection no addresses`,
          5000
        );
      }
      node.addresses.forEach((addr) => {
        this.log(LogLevel.Info, `Node ${key} has address:${addr}`);
      });
    }
    this.log(
      LogLevel.Info,
      `Node ${key} with direction:${connection.direction} is ready`
    );
  }

  private async getConnectedPeers(node: Node): Promise<void> {
    this.log(LogLevel.Info, `Getting connected peers for ${node.peerId}`);
    const connectedPeers = await this.requestConnectedPeers(node).catch(
      (error) => {
        this.log(
          LogLevel.Error,
          `Error in promise requestConnectedPeers: ${error}`
        );
        return undefined;
      }
    );
    if (connectedPeers) {
      connectedPeers.forEach(async (peerInfo: any) => {
        if (
          peerInfo.peerId == node.peerId ||
          peerInfo.peerId == this.localPeer ||
          this.banList.has(peerInfo.peerId)
        ) {
          return;
        }

        if (node.roles.has(this.config.roles.RELAY)) {
          const connection = node.getOpenedConnection();
          if (!connection) return;
          const relayAddress = connection.remoteAddr.toString();
          const fullAddress = `${relayAddress}/p2p-circuit/p2p/${peerInfo.peerId}`;
          if (
            !this.has(peerInfo.peerId) &&
            !this.candidatePeers.has(peerInfo.peerId)
          ) {
            this.candidatePeers.set(peerInfo.peerId, fullAddress);
            this.log(
              LogLevel.Info,
              `Candidate peer ${peerInfo.peerId} added (${fullAddress})`
            );
          }
        }
        if (node.roles.has(this.config.roles.NODE)) {
          if (isDirect(peerInfo.address) && !isLocalAddress(peerInfo.address)) {
            if (
              !this.has(peerInfo.peerId) &&
              !this.candidatePeers.has(peerInfo.peerId)
            ) {
              this.candidatePeers.set(peerInfo.peerId, peerInfo.address);
              this.log(
                LogLevel.Info,
                `Candidate peer ${peerInfo.peerId} added (${peerInfo.address})`
              );
            }
          }
        }
      });
    }
  }

  private async waitMultiaddrs(node: Node): Promise<void> {
    try {
      let countDelay = 0;
      while (node.addresses.size == 0 && countDelay < 10) {
        this.log(LogLevel.Info, `Waiting for multiaddrs`);
        await this.getMultiaddrs(node).catch((error) => {
          this.log(LogLevel.Error, `Error in promise getMultiaddrs: ${error}`);
        });
        if (node.addresses.size == 0) {
          await this.delay(500);
        }
        countDelay++;
      }
    } catch (error) {
      this.log(LogLevel.Error, `Error in waitMultiaddrs: ${error}`);
    }
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

  private async getMultiaddrs(node: Node): Promise<void> {
    try {
      const addresses = await this.requestMultiaddrs(node).catch((error) => {
        this.log(
          LogLevel.Error,
          `Error in promise requestMultiaddrs: ${error}`
        );
      });
      if (!addresses) {
        return;
      }

      addresses.forEach((addrr) => {
        if (!node.addresses.has(addrr)) {
          node.addresses.add(addrr);
        }
      });
    } catch (error) {
      this.log(LogLevel.Error, `Error in getRoles: ${error}`);
    }
  }

  private async tryConnect(address: string): Promise<Connection | undefined> {
    const ma = multiaddr(address);
    this.log(
      LogLevel.Info,
      `Trying to connect to ${ma.toString()} (PeerId: ${ma.getPeerId()?.toString()})`
    );
    const peerId = ma.getPeerId();
    if (!peerId) {
      return undefined;
    }
    if (this.banList.has(peerId.toString())) {
      this.log(LogLevel.Warning, `Node ${address} is banned`);
      return undefined;
    }
    const conn = await this.requestConnect(address).catch((error) => {
      this.log(LogLevel.Error, `Error in promise requestConnect: ${error}`);
      return undefined;
    });
    return conn;
  }

  private async delay(ms: number): Promise<void> {
    try {
      return new Promise((resolve) => setTimeout(resolve, ms));
    } catch (error) {
      this.log(LogLevel.Error, `Error in delay: ${error}`);
    }
  }
}
