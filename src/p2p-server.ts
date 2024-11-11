import { createLibp2p, Libp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import {
  circuitRelayServer,
  circuitRelayTransport,
} from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { PeerId } from "@libp2p/interface";
import {
  createFromProtobuf,
  createEd25519PeerId,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import fs from "fs/promises";
import path from "path";

import { ping } from "./services/ping/index.js";
import { roles } from "./services/roles/index.js";
import { peerList } from "./services/peer-list/index.js";
import { maList } from "./services/multiadress/index.js";

import pkg from "debug";
const { debug } = pkg;
const PEER_ID_FILE = path.resolve("peer-id.bin");

export class P2PServer {
  private node: Libp2p | undefined;
  private log = debug("p2p-server");
  localPeer: string | undefined;
  constructor() {}

  private async loadOrCreatePeerId(): Promise<PeerId | undefined> {
    try {
      const peerIdData = await fs.readFile(PEER_ID_FILE);
      const res = (await createFromProtobuf(peerIdData)) as unknown as PeerId;
      return res;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        const peerId = await createEd25519PeerId();
        await fs.writeFile(PEER_ID_FILE, exportToProtobuf(peerId));
        return peerId as unknown as PeerId;
      } else {
        return undefined;
      }
    }
  }

  private async createNode(): Promise<Libp2p | undefined> {
    try {
      const peerId = await this.loadOrCreatePeerId();
      if (!peerId) {
        this.log("Error loading or creating Peer ID");
        return undefined;
      }

      const privateKey = await privateKeyFromProtobuf(
        (peerId as any).privateKey
      );
      const PORT = 6006;
      const listenIp = "0.0.0.0";
      const node = await createLibp2p({
        start: false,
        privateKey: privateKey,
        addresses: {
          listen: [`/ip4/${listenIp}/tcp/${PORT}/ws`, "/p2p-circuit"],
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
        streamMuxers: [yamux()],
        services: {
          relay: circuitRelayServer({
            reservations: {
              maxReservations: 64,
              defaultDurationLimit: 3600,
              defaultDataLimit: BigInt(1024) * BigInt(1024),
            },
          }),
          aminoDHT: kadDHT({
            clientMode: true,
            protocol: "/ipfs/kad/1.0.0",
            peerInfoMapper: removePrivateAddressesMapper,
          }),
          identify: identify(),
          identifyPush: identifyPush(),
          ping: ping(),
          roles: roles({
            roles: ["chainrelay"],
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

  async startNode(): Promise<void> {
    try {
      this.node = await this.createNode();
      if (!this.node) {
        this.log("Node is not initialized");
        console.log("Node is not initialized");
        return;
      }

      this.node.addEventListener("start", (event: any) => {
        this.log("Libp2p node started");
        console.log("Libp2p node started");
      });

      await this.node.start();
      this.localPeer = this.node.peerId.toString();
      this.log(`Local peer ID: ${this.localPeer}`);
      console.log(`Local peer ID: ${this.localPeer}`);
      this.log(`Libp2p listening on:`);
      console.log(`Libp2p listening on:`);

      this.node.getMultiaddrs().forEach((ma) => {
        this.log(`${ma.toString()}`);
        console.log(`${ma.toString()}`);
      });
    } catch (err: any) {
      this.log(`Error on start server node - ${err}`);
      console.log(`Error on start server node - ${err}`);
    }
  }
}
