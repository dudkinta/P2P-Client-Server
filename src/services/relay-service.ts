import { P2PServer } from "../p2p-server.js";
import { EventEmitter } from "events";
import { Connection, PeerId } from "@libp2p/interface";
import { multiaddr } from "@multiformats/multiaddr";
import ConfigLoader from "../helpers/config-loader.js";
import { LogLevel } from "../helpers/log-level.js";
import pkg from "debug";
const { debug } = pkg;

export class RelayService extends EventEmitter {
  private client: P2PServer;
  private localPeer: PeerId | undefined;
  private knowsRelay = ConfigLoader.getInstance().getRelays();
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    console.log("relay-service", level, timestamp, message);
    debug("relay-service")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  private banList: Set<string> = new Set();

  constructor(client: P2PServer) {
    super();
    this.client = client;
  }
  async startAsync(): Promise<void> {
    await this.client.startNode();
    this.localPeer = this.client.localPeerId;
    if (!this.localPeer) {
      this.log(LogLevel.Warning, "Local peer not found");
      return;
    }
    setTimeout(async () => {
      this.mainCycle();
    }, 0);
  }

  private async mainCycle(): Promise<void> {
    setTimeout(async () => {
      await this.mainCycle();
    }, 60000);
  }
  private async connectToRelays(): Promise<void> {
    const relays = this.knowsRelay;
    for (const relay of relays) {
      this.log(LogLevel.Info, `Trying connect to know relay ${relay}`);
      const connRelay = await this.tryConnect(relay).catch((error) => {
        this.log(LogLevel.Error, `Error in promise requestConnect: ${error}`);
      });
      if (!connRelay) {
        this.log(LogLevel.Warning, `Relay ${relay} not connected`);
      }
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
    const conn = await this.RequestConnect(address).catch((error) => {
      this.log(LogLevel.Error, `Error in promise RequestConnect: ${error}`);
      return undefined;
    });
    return conn;
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
}
