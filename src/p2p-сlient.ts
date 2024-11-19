import { EventEmitter } from "events";
import { Libp2p } from "libp2p";
import { TimeoutError, PeerInfo, Connection, PeerId } from "@libp2p/interface";
import { PingService } from "./services/ping/index.js";
import { RolesService } from "./services/roles/index.js";
import { PeerListService } from "./services/peer-list/index.js";
import { MultiaddressService } from "./services/multiadress/index.js";
import { Multiaddr, multiaddr } from "@multiformats/multiaddr";
import ConfigLoader from "./helpers/config-loader.js";
import { sendDebug } from "./services/socket-service.js";
import { LogLevel } from "./helpers/log-level.js";
import pkg from "debug";
import {
  getNodeClient,
  getRelayClient,
  generateCID,
} from "./helpers/libp2p-helper.js";
import { getIpAndCheckPort } from "./helpers/check-ip.js";
import { KadDHT } from "@libp2p/kad-dht";
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

  async getFromDHT(dhtKey: string): Promise<any> {
    if (!this.node) {
      return undefined;
    }
    try {
      const dht = this.node.services.aminoDHT as KadDHT;
      if (!dht) {
        throw new Error("getFromDHT. DHT service is not initialized");
      }
      const value = await dht.get(new TextEncoder().encode(dhtKey));
      if (value) {
        for await (const event of value) {
          if (event.name === "VALUE") {
            const decodedValue = JSON.parse(
              new TextDecoder().decode(event.value)
            );
            return decodedValue;
          }
        }
      }
      return undefined;
    } catch (err) {
      this.log(LogLevel.Error, `Failed to get from DHT: ${err}`);
      return undefined;
    }
  }

  private async sendToDHT(dhtKey: string, dhtData: any): Promise<void> {
    if (!this.node) {
      return;
    }
    try {
      const dht = this.node.services.dht as KadDHT;
      if (!dht) {
        throw new Error("sendToDHT. DHT service is not initialized");
      }

      await dht.put(
        new TextEncoder().encode(dhtKey),
        new TextEncoder().encode(dhtData)
      );

      this.log(
        LogLevel.Info,
        `Successfully published port info to DHT: ${dhtKey}`
      );
    } catch (err) {
      this.log(LogLevel.Error, `Failed to publish port info to DHT: ${err}`);
    }
  }

  async findProviders(key: string): Promise<PeerInfo[]> {
    const res = new Set<PeerInfo>();
    if (!this.node) {
      this.log(LogLevel.Error, "Node is not initialized");
      throw new Error("Node is not initialized for findProviders");
    }
    const cid = await generateCID(key);
    const providers = await this.node.contentRouting.findProviders(cid);
    for await (const provider of providers) {
      res.add(provider);
      console.log(`Found provider: ${provider.id.toString()}`);
    }
    return Array.from(res);
  }

  private async publishProvider(key: string): Promise<void> {
    if (!this.node) {
      this.log(LogLevel.Error, "Node is not initialized");
      throw new Error("Node is not initialized for publishProvider");
    }
    const cid = await generateCID(key);
    await this.node.contentRouting.provide(cid);
    console.log(`Provided key ${key} with CID ${cid.toString()} to DHT`);
  }

  private async sendDirectDataToDHT(checkIPResult: any): Promise<void> {
    let needResend = false;
    if (!this.node) {
      this.log(LogLevel.Error, "Publish to DHT. Node is not initialized");
      return;
    }
    if (!this.localPeerId) {
      this.log(
        LogLevel.Error,
        "Publish to DHT. LocalPeerId is not initialized"
      );
      return;
    }

    const maListService = this.node.services.maList as MultiaddressService;
    maListService.setCheckIpResult(checkIPResult);

    if (checkIPResult.ipv4portOpen || checkIPResult.ipv6portOpen) {
      this.log(LogLevel.Info, `Send to DHT open ports`);
      const dhtData = JSON.stringify({
        ipv4: checkIPResult.ipv4,
        ipv6: checkIPResult.ipv6,
        port: checkIPResult.port,
        ipv4portOpen: checkIPResult.ipv4portOpen,
        ipv6portOpen: checkIPResult.ipv6portOpen,
        timestamp: Date.now(),
      });
      await this.publishProvider("/direct-connect").catch((err) => {
        this.log(
          LogLevel.Error,
          `Error in publishProvider /direct-connect: ${err}`
        );
        needResend = true;
      });
      // Генерируем ключ для записи в DHT
      const dhtKey = `/direct-connect/${this.localPeerId.toString()}`;
      this.sendToDHT(dhtKey, dhtData).catch((err) => {
        this.log(LogLevel.Error, `Error in sendToDHT: ${err}`);
        needResend = true;
      });
      if (needResend) {
        setTimeout(async () => {
          await this.sendDirectDataToDHT(checkIPResult);
        }, 10000);
      }
    }
  }

  private async sendConnectDataToDHT(): Promise<void> {
    let needResend = false;
    await this.publishProvider("/node-connect").catch((err) => {
      this.log(
        LogLevel.Error,
        `Error in publishProvider /node-connect: ${err}`
      );
      needResend = true;
    });
    if (needResend) {
      setTimeout(async () => {
        await this.sendConnectDataToDHT();
      }, 10000);
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

      setTimeout(async () => {
        await this.sendConnectDataToDHT();
      }, 10000);

      const currentPort = this.node
        .getMultiaddrs()[0]
        .toString()
        .split("/tcp/")[1];
      const checkIPResult = await getIpAndCheckPort(
        Number.parseFloat(currentPort)
      ).catch((err) => {
        this.log(LogLevel.Error, `Error in getIpAndCheckPort: ${err}`);
      });
      this.log(
        LogLevel.Info,
        `Check IP result: ${JSON.stringify(checkIPResult)}`
      );

      if (checkIPResult) {
        setTimeout(async () => {
          await this.sendDirectDataToDHT(checkIPResult);
        }, 60000);
      }
    } catch (err: any) {
      this.log(LogLevel.Error, `Error on start client node - ${err}`);
    }
  }
}
