import { P2PClient } from "./../p2p-сlient.js";
import { Connection, PeerId } from "@libp2p/interface";
import { multiaddr } from "@multiformats/multiaddr";
import ConfigLoader from "../helpers/config-loader.js";
import { LogLevel } from "../helpers/log-level.js";
import { Relay } from "../models/relay.js";
import pkg from "debug";
const { debug } = pkg;

export class RelayService {
  private client: P2PClient;
  private localPeer: PeerId | undefined;
  private config = ConfigLoader.getInstance();
  private log = (level: LogLevel, message: string) => {
    const timestamp = new Date();
    debug("relay-service")(
      `[${timestamp.toISOString().slice(11, 23)}] ${message}`
    );
  };
  private relayList: Map<string, Relay> = new Map();
  private banList: Set<string> = new Set();

  constructor(client: P2PClient) {
    this.client = client;
  }
  async startAsync(): Promise<void> {
    await this.client.startNode();
    const localPeer = this.client.localPeerId;
    if (!localPeer) {
      this.log(LogLevel.Warning, "Local peer not found");
      return;
    }

    this.localPeer = this.client.localPeerId;
    this.config.getRelays().forEach((relay) => {
      const ma = multiaddr(relay);
      const addrList = new Set<string>();
      const addr = ma.toString();
      const peerId = ma.getPeerId()?.toString();
      if (peerId && addr && peerId !== localPeer.toString()) {
        const relayPeer = new Relay(peerId);
        addrList.add(addr);
        relayPeer.addrList = addrList;
        relayPeer.connection = undefined;
        this.relayList.set(peerId, relayPeer);
      }
    });

    this.client.on("connection:open", async (event: any) => {
      try {
        const conn = event;
        const peerId = event.remotePeer;
        if (!peerId) return;
        if (peerId.toString() === this.localPeer) return;
        if (conn.status !== "open") return;
        const knowRelay = this.relayList.get(peerId.toString());

        if (knowRelay) {
          this.log(LogLevel.Info, `${knowRelay?.peerId} found in relayList`);
          knowRelay.connection = conn;
          knowRelay.addrList.add(conn.remoteAddr.toString());
        } else {
          this.log(
            LogLevel.Info,
            `${peerId.toString()} not found in relayList`
          );
          const roleResp = await this.client.getRolesByAddress(conn);
          const roles = JSON.parse(roleResp);
          if (roles && roles.includes(this.config.getConfig().roles.RELAY)) {
            const relayPeer = new Relay(peerId.toString());
            relayPeer.connection = conn;
            relayPeer.addrList.add(conn.remoteAddr.toString());
            this.relayList.set(peerId.toString(), relayPeer);
            this.config.saveRelay(conn.remoteAddr.toString());
          }
        }
        this.log(LogLevel.Info, `Connection open to ${peerId.toString()}`);
      } catch (error) {
        this.log(
          LogLevel.Error,
          `Error in connection:open event handler ${JSON.stringify(error)}`
        );
      }
    });
    this.client.on("connection:close", (event: any) => {
      try {
        const conn = event;
        const peerId = event.remotePeer;
        if (!peerId) return;
        if (peerId.toString() === this.localPeer) return;
        if (conn.status !== "closed") return;
        const knowRelay = this.relayList.get(peerId.toString());
        if (knowRelay) {
          knowRelay.connection = undefined;
        }
        this.log(LogLevel.Info, `Connection closed to ${peerId.toString()}`);
      } catch (error) {
        this.log(
          LogLevel.Error,
          `Error in connection:close event handler ${JSON.stringify(error)}`
        );
      }
    });

    setTimeout(async () => {
      this.mainCycle();
    }, 0);
  }

  private async mainCycle(): Promise<void> {
    this.relayList.forEach(async (relay) => {
      if (!relay.connection && !this.banList.has(relay.peerId)) {
        for (const addr of relay.addrList.keys()) {
          const conn = await this.RequestConnect(addr).catch((error) => {
            this.log(
              LogLevel.Error,
              `Error in promise requestConnect: ${error}`
            );
          });
          if (conn) {
            relay.connection = conn;
            relay.addrList.add(conn.remoteAddr.toString());
            this.log(LogLevel.Info, `Connected to ${relay.peerId}`);
            break;
          } else {
            this.banList.add(relay.peerId);
            setTimeout(async () => {
              this.banList.delete(relay.peerId);
            }, 60000);
          }
        }
      }
      if (relay.connection) {
        const isOpen = relay.connection.status === "open";
        if (!isOpen) {
          this.log(LogLevel.Warning, `Relay ${relay.peerId} not connected`);
          this.banList.add(relay.peerId);
          setTimeout(async () => {
            this.banList.delete(relay.peerId);
          }, 60000);
          relay.connection = undefined;
          return;
        }
      }
    });

    setTimeout(async () => {
      await this.mainCycle();
    }, 60000);
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
