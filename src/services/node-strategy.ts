import { Node } from "../models/node.js";
import ConfigLoader from "../helpers/config-loader.js";
import { isLocalAddress, isDirect, isRelay } from "../helpers/check-ip.js";
import { Connection } from "@libp2p/interface";
import pkg from "debug";
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
  private requestConnect: RequestConnect;
  private requestDisconnect: RequestDisconnect;
  private requestRoles: RequestRoles;
  private requestMultiaddrs: RequestMultiaddrs;
  private requestConnectedPeers: RequestConnectedPeers;
  private requestPing: RequestPing;
  private log = debug("node-strategy");
  private localPeer: string | undefined;
  private candidatePeers: Map<string, string> = new Map();
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
  }

  set(key: string, value: Node): this {
    super.set(key, value);
    this.log(`Node ${key} added to storage`);
    this.startNodeStrategy(key, value);
    return this;
  }

  async startStrategy(localPeer: string): Promise<void> {
    this.log(`Starting global strategy`);
    this.localPeer = localPeer;
    await this.connectToMainRelay().catch((error) => {
      this.log(`Error in promise connectToMainRelay: ${error}`);
    });
    setTimeout(async () => {
      await this.selfDiag();
    }, 10000);
  }

  private async connectToMainRelay(): Promise<void> {
    const relay = this.config.relay[0];
    const address = `/ip4/${relay.ADDRESS}/tcp/${relay.PORT}/ws/p2p/${relay.PEER}`;
    const connRelay = await this.requestConnect(address).catch((error) => {
      this.log(`Error in promise requestConnect: ${error}`);
    });
    if (!connRelay) {
      this.log(`Relay not connected`);
      return;
    }
  }

  private async selfDiag(): Promise<void> {
    this.removeDeadNodes();
    this.counterByRoles();
    // если никого нет, то подключаемся к релейному узлу
    if (this.size == 0) {
      this.log(`No nodes in storage`);
      await this.connectToMainRelay().catch((error) => {
        this.log(`Error in promise connectToMainRelay: ${error}`);
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
        await this.stopNodeStrategy(key).catch((error) => {
          this.log(`Error in promise stopNodeStrategy: ${error}`);
        });
      }
      this.log(
        `Limits connection ${connection.remoteAddr.toString()} \r\nLimits bytes:${connection.limits.bytes}  Limits second:${connection.limits.seconds}`
      );
    }

    // обновляем список кандидатов
    for (const [key, node] of this) {
      await this.getConnectedPeers(node).catch((error) => {
        this.log(`Error in promise getConnectedPeers: ${error}`);
      });
    }

    // тест кандидатов и подключение к ним
    for (const [key, address] of this.candidatePeers) {
      if (this.has(key)) {
        continue;
      }
      if (this.size >= this.config.MAX_NODES) {
        this.log(
          `Max nodes limit reached. Current nodes: ${this.size}, Max nodes: ${this.config.MAX_NODES}`
        );
        break;
      }

      this.log(`Trying to ping candidate ${key} (${address})`);
      const ping = await this.requestPing(address).catch((error) => {
        this.log(`Error in promise requestPing: ${error}`);
        return undefined;
      });
      this.candidatePeers.delete(key);
      if (ping) {
        this.log(`Candidate ${key} (${address}) ping: ${ping}`);
        await this.requestConnect(address).catch((error) => {
          this.log(`Error in promise requestConnect: ${error}`);
          return undefined;
        });
      }
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
        this.log(`Checking addresses for node: ${key}`);
        node.addresses.forEach(async (address) => {
          if (isDirect(address) && !isLocalAddress(address)) {
            this.log(`Address ${address}`);
          }
        });
      }
    }

    setTimeout(async () => {
      await this.selfDiag();
    }, 10000);
  }

  private removeDeadNodes() {
    for (const [key, node] of this) {
      if (!node) {
        this.penaltyNodes.push(key);
        continue;
      }
      const connection = node.getOpenedConnection();
      if (!connection) {
        this.penaltyNodes.push(key);
        continue;
      }
      if (connection.direction == "outbound" && node.roles.size == 0) {
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
      this.log(`NetworkStrategy-> Delete node: ${key}`);
      this.delete(key);
    });
    this.penaltyNodes = this.penaltyNodes.filter(
      (node) => !keysForDelete.includes(node)
    );
  }

  private counterByRoles(): void {
    let rCount = 0;
    let nCount = 0;
    let uCount = 0;
    let inBoundCount = 0;
    let ouBboundCount = 0;
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
    }
    this.relayCount = rCount;
    this.nodeCount = nCount;
    this.unknownCount = uCount;
    this.log(
      `Counter-> Relay count: ${this.relayCount}, Node count: ${this.nodeCount}, Unknown count: ${this.unknownCount}`
    );
    this.log(
      `Counter-> Inbouund count: ${inBoundCount}, Outbound count: ${ouBboundCount}`
    );
  }

  async stopNodeStrategy(key: string): Promise<void> {
    this.log(`Stopping node strategy for ${key}`);
    const node = this.get(key);
    if (!node) {
      return;
    }
    node.connections.forEach(async (conn) => {
      if (conn.status != "closed") {
        await this.requestDisconnect(conn.remoteAddr.toString()).catch(
          (error) => {
            this.log(`Error in promise requestDisconnect: ${error}`);
          }
        );
      }
    });
    this.delete(key);
    this.log(`Node ${key} removed from storage`);
  }

  private async startNodeStrategy(key: string, node: Node): Promise<void> {
    this.log(`Starting node strategy for ${key}`);
    await this.waitConnect(node).catch((error) => {
      this.log(`Error in promise waitConnect: ${error}`);
    });
    const connection = node.getOpenedConnection();
    if (!connection) {
      await this.stopNodeStrategy(key);
      this.log(`Node ${key} is not connected. Self remove`);
      return;
    }

    this.log(`Node ${key} is connected`);
    await this.waitRoles(node).catch((error) => {
      this.log(`Error in promise waitRoles: ${error}`);
    });
    if (connection.direction == "outbound" && node.roles.size == 0) {
      await this.stopNodeStrategy(key);
    }
    node.roles.forEach((role) => {
      this.log(`Node ${key} has role:${role}`);
    });
    if (node.roles.has(this.config.roles.NODE)) {
      await this.waitMultiaddrs(node).catch((error) => {
        this.log(`Error in promise waitMultiaddrs: ${error}`);
      });
      if (connection.direction == "outbound" && node.addresses.size == 0) {
        await this.stopNodeStrategy(key);
      }
      node.addresses.forEach((addr) => {
        this.log(`Node ${key} has address:${addr}`);
      });
    }
    this.log(`Node ${key} with direction:${connection.direction} is ready`);
  }

  private async getConnectedPeers(node: Node): Promise<void> {
    this.log(`Getting connected peers for ${node.peerId}`);
    const connectedPeers = await this.requestConnectedPeers(node).catch(
      (error) => {
        this.log(`Error in promise requestConnectedPeers: ${error}`);
        return undefined;
      }
    );
    if (connectedPeers) {
      connectedPeers.forEach(async (peerInfo: any) => {
        if (
          peerInfo.peerId == node.peerId ||
          peerInfo.peerId == this.localPeer
        ) {
          return;
        }

        if (node.roles.has(this.config.roles.RELAY)) {
          const connection = node.getOpenedConnection();
          if (!connection) return;
          const relayAddress = connection.remoteAddr.toString();
          const fullAddress = `${relayAddress}/p2p-circuit/p2p/${peerInfo.peerId}`;
          if (!this.candidatePeers.has(peerInfo.peerId)) {
            this.candidatePeers.set(peerInfo.peerId, fullAddress);
            this.log(
              `Candidate peer ${peerInfo.peerId} added (${fullAddress})`
            );
          }
        }
        if (node.roles.has(this.config.roles.NODE)) {
          if (isDirect(peerInfo.address) && !isLocalAddress(peerInfo.address)) {
            if (!this.candidatePeers.has(peerInfo.peerId)) {
              this.candidatePeers.set(peerInfo.peerId, peerInfo.address);
              this.log(
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
        this.log(`Waiting for multiaddrs`);
        await this.getMultiaddrs(node).catch((error) => {
          this.log(`Error in promise getMultiaddrs: ${error}`);
        });
        if (node.addresses.size == 0) {
          await this.delay(500);
        }
        countDelay++;
      }
    } catch (error) {
      this.log(`Error in waitMultiaddrs: ${error}`);
    }
  }

  private async waitRoles(node: Node): Promise<void> {
    try {
      let countDelay = 0;
      while (node.roles.size == 0 && countDelay < 10) {
        this.log(`Waiting for roles`);
        await this.getRoles(node).catch((error) => {
          this.log(`Error in promise getRoles: ${error}`);
        });
        if (node.roles.size == 0) {
          await this.delay(500);
        }
        countDelay++;
      }
    } catch (error) {
      this.log(`Error in waitConnect: ${error}`);
    }
  }

  private async waitConnect(node: Node): Promise<void> {
    try {
      let countDelay = 0;
      while (!node.isConnect() && countDelay < 10) {
        this.log(`Waiting for connect`);
        await this.delay(500);
        countDelay++;
      }
    } catch (error) {
      this.log(`Error in waitConnect: ${error}`);
    }
  }

  private async getRoles(node: Node): Promise<void> {
    try {
      let roles: string[] | undefined;
      roles = await this.requestRoles(node).catch((error) => {
        this.log(`Error in promise getRoles: ${error}`);
        return undefined;
      });
      if (roles != undefined) {
        roles.forEach((role) => {
          node.roles.add(role);
        });
      }
    } catch (error) {
      this.log(`Error in getRoles: ${error}`);
    }
  }

  private async getMultiaddrs(node: Node): Promise<void> {
    try {
      const addresses = await this.requestMultiaddrs(node).catch((error) => {
        this.log(`Error in promise requestMultiaddrs: ${error}`);
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
      this.log(`Error in getRoles: ${error}`);
    }
  }

  private async delay(ms: number): Promise<void> {
    try {
      return new Promise((resolve) => setTimeout(resolve, ms));
    } catch (error) {
      this.log(`Error in delay: ${error}`);
    }
  }
}
