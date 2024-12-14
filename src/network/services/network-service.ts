import { EventEmitter } from "events";
import ConfigLoader from "../../common/config-loader.js";
import { P2PClient } from "../p2p-сlient.js";
import { multiaddr } from "@multiformats/multiaddr";
import { Connection, PeerId } from "@libp2p/interface";
import { Node } from "../models/node.js";
import { NodeStrategy } from "./node-strategy.js";
import { RelayStrategy } from "./relay-strategy.js";
import { OutOfLimitError } from "../models/out-of-limit-error.js";
import { sendDebug } from "./socket-service.js";
import { LogLevel } from "../helpers/log-level.js";
import { RequestStore, StoreItem } from "./store/index.js";
import pkg from "debug";
import { MessageChain } from "./messages/index.js";
const { debug } = pkg;

export interface IStrategy {
  get: (peer: string) => Node | undefined;
  set: (peer: string, node: Node) => void;
  startStrategy(localPeer: PeerId): Promise<void>;
  stopNodeStrategy(key: string, cause: string, banTimer: number): Promise<void>;
  getRoot(): { root: Node; connections: Connection[] } | undefined;
}
export type RequestConnect = (addrr: string) => Promise<Connection | undefined>;
export type RequestDisconnect = (addrr: string) => Promise<void>;
export type RequestRoles = (node: Node) => Promise<string[] | undefined>;
export type RequestMultiaddrs = (node: Node) => Promise<string[] | undefined>;
export type RequestConnectedPeers = (
  node: Node
) => Promise<Map<string, string> | undefined>;
export type RequestStoreData = (request: RequestStore) => StoreItem[];

export class NetworkService extends EventEmitter {
  private client: P2PClient;
  private storage: IStrategy;
  private localPeer: PeerId | undefined;
  private config = ConfigLoader.getInstance().getConfig();
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    sendDebug("node-service", level, timestamp, message);
    debug("node-service")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  constructor(p2pClient: P2PClient) {
    super();
    this.client = p2pClient;
    if (this.config.nodeType == this.config.roles.NODE) {
      this.storage = new NodeStrategy(
        this.RequestConnect.bind(this),
        this.RequestDisconnect.bind(this),
        this.RequestRoles.bind(this),
        this.RequestMultiaddrrs.bind(this),
        this.RequestConnectedPeers.bind(this),
        this.RequestStoreData.bind(this)
      );
    } else {
      this.storage = new RelayStrategy(
        this.RequestConnect.bind(this),
        this.RequestDisconnect.bind(this),
        this.RequestRoles.bind(this),
        this.RequestMultiaddrrs.bind(this),
        this.RequestConnectedPeers.bind(this),
        this.RequestStoreData.bind(this)
      );
    }
  }

  public async startAsync(): Promise<void> {
    try {
      await this.client.startNode();
      this.localPeer = this.client.localPeerId;
      if (!this.localPeer) {
        this.log(LogLevel.Warning, "Local peer not found");
        return;
      }

      this.client.on("connection:open", (event: any) => {
        try {
          const conn = event;
          const peerId = event.remotePeer;
          if (!peerId) return;
          if (peerId.toString() === this.localPeer) return;
          if (conn.status !== "open") return;

          this.getNode(peerId.toString(), peerId, conn);
        } catch (error) {
          this.log(
            LogLevel.Error,
            `Error in connection:open event handler ${JSON.stringify(error)}`
          );
        }
      });

      this.client.on("updateProtocols", (event) => {
        try {
          const { protocols, peerId } = event;
          if (!peerId) return;
          if (peerId.toString() === this.localPeer) return;

          const node = this.getNode(peerId.toString(), peerId, undefined);
          if (protocols && node) {
            protocols.forEach((protocol: string) => {
              if (!node.protocols.has(protocol)) {
                node.protocols.add(protocol);
              }
            });
          }
        } catch (error) {
          this.log(
            LogLevel.Error,
            `Error in updateProtocols event handler ${JSON.stringify(error)}`
          );
        }
      });
      this.client.on("peer:disconnect", async (event) => {
        try {
          const peerId = event;
          if (!peerId) return;
          this.log(
            LogLevel.Warning,
            `Connection closed to ${peerId.toString()}`
          );
          await this.storage.stopNodeStrategy(
            peerId.toString(),
            `signal from event:peer:disconnect`,
            10000
          );
        } catch (error) {
          this.log(
            LogLevel.Error,
            `Error in connection:close event handler ${JSON.stringify(error)}`
          );
        }
      });
      this.client.on("message:addValidator", (event: any) => {
        this.emit("message:addValidator", event);
      });
      this.client.on("message:removeValidator", (event: any) => {
        this.emit("message:removeValidator", event);
      });
      this.client.on("message:disconnect", (event: any) => {
        this.emit("message:disconnect", event);
      });
      this.client.on("message:headIndex", (event: any) => {
        this.emit("message:headIndex", event);
      });
      this.client.on("message:requestchain", (event: any) => {
        this.emit("message:requestchain", event);
      });
      this.client.on("message:blockchainData", (event: any) => {
        this.emit("message:blockchainData", event);
      });
      this.client.on("message:unknown", (event: any) => {
        this.log(LogLevel.Error, `Unknown message: ${event.detail}`);
        this.emit("message:unknown", event);
      });
      await this.storage.startStrategy(this.localPeer).catch((error) => {
        this.log(
          LogLevel.Error,
          `Error starting nodeStorage ${JSON.stringify(error)}`
        );
      });
    } catch (error) {
      this.log(LogLevel.Error, `Error in startAsync ${JSON.stringify(error)}`);
    }
  }

  private getNode(
    peer: string,
    peerId: PeerId | undefined,
    connection: Connection | undefined
  ): Node | undefined {
    try {
      let node = this.storage.get(peer);
      if (!node) {
        node = new Node(peerId, connection);
        this.storage.set(peer, node);
      } else {
        if (peerId) {
          node.peerId = peerId;
        }
        if (connection) {
          node.connections.add(connection);
        }
      }
      return node;
    } catch (error) {
      this.log(LogLevel.Error, `Error in getNode ${JSON.stringify(error)}`);
      return undefined;
    }
  }

  private async RequestConnect(addrr: string): Promise<Connection | undefined> {
    try {
      const ma = multiaddr(addrr);
      this.log(LogLevel.Info, `Connecting to ${ma.toString()}`);
      const conn = await this.client.connectTo(ma).catch((error) => {
        this.log(
          LogLevel.Error,
          `Error in promise RequestConnect ${JSON.stringify(error)}`
        );
        return undefined;
      });
      this.log(LogLevel.Info, `Connected to ${ma.toString()}`);
      return conn;
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Error in RequestConnect ${JSON.stringify(error)}`
      );
      return undefined;
    }
  }

  private async RequestDisconnect(addrr: string): Promise<void> {
    try {
      const ma = multiaddr(addrr);
      this.log(LogLevel.Info, `Disconnecting from ${ma.toString()}`);
      await this.client.disconnectFromMA(ma).catch((error) => {
        this.log(
          LogLevel.Error,
          `Error in promise RequestDisconnect ${JSON.stringify(error)}`
        );
      });
    } catch (error) {
      this.log(
        LogLevel.Error,
        `Error in RequestDisconnect ${JSON.stringify(error)}`
      );
    }
  }

  private async RequestRoles(node: Node): Promise<string[] | undefined> {
    if (!node.isConnect()) {
      this.log(LogLevel.Warning, `Node is not connected`);
      return undefined;
    }
    if (!node.peerId) {
      this.log(LogLevel.Warning, `PeerId is undefined`);
      return undefined;
    }
    try {
      if (node.protocols.has(this.config.protocols.ROLE)) {
        const connection = node.getOpenedConnection();
        if (!connection) return undefined;

        let rolesStr = await this.client
          .getRolesByAddress(connection)
          .catch((error) => {
            this.log(
              LogLevel.Error,
              `Error in promise RequestRoles ${JSON.stringify(error)}`
            );
            throw error;
          });
        if (!rolesStr || rolesStr.length === 0) return undefined;
        try {
          this.log(
            LogLevel.Info,
            `Roles for ${node.peerId?.toString()} is: ${rolesStr}`
          );
          return JSON.parse(rolesStr);
        } catch (parseError) {
          this.log(
            LogLevel.Error,
            `Error parsing roleList JSON ${JSON.stringify(parseError)}`
          );
          return undefined;
        }
      }
    } catch (error) {
      if (error instanceof OutOfLimitError) {
        this.storage.stopNodeStrategy(
          node.peerId.toString(),
          "Out of limit",
          10000
        );
      } else {
        this.log(
          LogLevel.Error,
          `Error in RequestRoles ${JSON.stringify(error)}`
        );
      }
      return undefined;
    }
  }

  private async RequestMultiaddrrs(node: Node): Promise<string[] | undefined> {
    if (!node.isConnect()) {
      this.log(LogLevel.Warning, `Node is not connected`);
      return undefined;
    }
    if (!node.peerId) {
      this.log(LogLevel.Warning, `PeerId is undefined`);
      return undefined;
    }
    try {
      if (node.protocols.has(this.config.protocols.MULTIADDRES)) {
        const connection = node.getOpenedConnection();
        if (!connection) return undefined;

        let addrrListStr = await this.client
          .getMultiaddresses(connection)
          .catch((error) => {
            this.log(
              LogLevel.Error,
              `Error in promise RequestMultiaddrrs ${JSON.stringify(error)}`
            );
            throw error;
          });
        if (!addrrListStr || addrrListStr.length === 0) return undefined;
        try {
          this.log(
            LogLevel.Info,
            `Multiaddrrs for ${node.peerId?.toString()} is: ${addrrListStr}`
          );
          return JSON.parse(addrrListStr);
        } catch (parseError) {
          this.log(
            LogLevel.Error,
            `Error parsing addrrListStr JSON ${JSON.stringify(parseError)}`
          );
          return undefined;
        }
      }
    } catch (error) {
      if (error instanceof OutOfLimitError) {
        this.storage.stopNodeStrategy(
          node.peerId.toString(),
          "Out of limit",
          10000
        );
      } else {
        this.log(
          LogLevel.Error,
          `Error in RequestMultiaddrrs ${JSON.stringify(error)}`
        );
      }
      return undefined;
    }
  }

  private async RequestConnectedPeers(node: Node): Promise<any | undefined> {
    if (!node.isConnect()) {
      this.log(LogLevel.Warning, `Node is not connected`);
      return undefined;
    }
    if (!node.peerId) {
      this.log(LogLevel.Warning, `PeerId is undefined`);
      return undefined;
    }
    try {
      if (node.protocols.has(this.config.protocols.PEER_LIST)) {
        const connection = node.getOpenedConnection();
        if (!connection) return undefined;

        let peersStr = await this.client
          .getPeerList(connection)
          .catch((error) => {
            this.log(
              LogLevel.Error,
              `Error in promise RequestConnectedPeers ${JSON.stringify(error)}`
            );
            throw error;
          });
        if (!peersStr || peersStr.length === 0) return undefined;
        try {
          this.log(
            LogLevel.Info,
            `Connected peers for ${node.peerId?.toString()} is: ${peersStr}`
          );
          return JSON.parse(peersStr);
        } catch (parseError) {
          this.log(
            LogLevel.Error,
            `Error parsing peersStr JSON ${JSON.stringify(parseError)}`
          );
          return undefined;
        }
      }
    } catch (error) {
      if (error instanceof OutOfLimitError) {
        this.storage.stopNodeStrategy(
          node.peerId.toString(),
          "Out of limit",
          10000
        );
      } else {
        this.log(
          LogLevel.Error,
          `Error in RequestConnectedPeers ${JSON.stringify(error)}`
        );
      }
      return undefined;
    }
  }

  public RequestStoreData(request: RequestStore): StoreItem[] {
    return this.client.getStore(request);
  }

  public getRoot(): { root: Node; connections: Connection[] } | undefined {
    return this.storage?.getRoot();
  }

  public async broadcastMessage(message: MessageChain): Promise<void> {
    await this.client.broadcastMessage(message);
  }
  public async sendMessageToConnection(peerId: string, message: MessageChain) {
    await this.client.sendMessageToConnection(peerId, message);
  }
}
