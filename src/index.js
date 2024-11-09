import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayServer, circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { ping } from './ping/index.js';
import { roles } from './roles/index.js';
import { peerList } from './peer-list/index.js';
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { createLibp2p } from "libp2p";
import {
  createFromProtobuf,
  createEd25519PeerId,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import fs from "fs/promises";
import path from "path";

const PEER_ID_FILE = path.resolve("peer-id.bin");
const PORT = 6006;
const PEER_LIST_PROTOCOL = "/chain/peers/1.0.0";

async function loadOrCreatePeerId() {
  try {
    const peerIdData = await fs.readFile(PEER_ID_FILE);
    const res = await createFromProtobuf(peerIdData);
    return res;
  } catch (err) {
    if (err.code === "ENOENT") {
      const peerId = await createEd25519PeerId();
      await fs.writeFile(PEER_ID_FILE, exportToProtobuf(peerId));
      return peerId;
    } else {
      throw err;
    }
  }
}

async function main() {
  const peerId = await loadOrCreatePeerId();
  console.log("Using Peer ID:", peerId.toString());
  const privateKey = await privateKeyFromProtobuf(peerId.privateKey);
  const listenIp = "0.0.0.0";
  const server = await createLibp2p({
    privateKey: privateKey,
    addresses: {
      listen: [`/ip4/${listenIp}/tcp/${PORT}/ws`, '/p2p-circuit']
    },
    transports: [
      webSockets({
        filter: filters.all,
      }),
      /*circuitRelayTransport({
        maxInboundStopStreams: 500,
        maxOutboundStopStreams: 500,
        stopTimeout: 60000,
        reservationCompletionTimeout: 20000,
      }),*/
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      ping: ping(),
      roles: roles({ roles: ["chainrelay"] }),
      peerList: peerList(),
      identify: identify(),
      relay: circuitRelayServer({
        hopTimeout: 60000,
        maxInboundHopStreams: 500,
        maxOutboundHopStreams: 500,
        maxOutboundStopStreams: 500,
        reservations: {
          maxReservations: 128,
          defaultDurationLimit: Infinity,
          defaultDataLimit: BigInt(1 << 20),
        },
      }),
      aminoDHT: kadDHT({
        clientMode: false,
        serverMode: true,
        protocol: "/ipfs/kad/1.0.0",
        peerInfoMapper: removePrivateAddressesMapper
      }),
    },
  });

  try {
    await server.start();
    console.log("Server has started. Waiting for addresses...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.info(
      "The relay node is running and listening on the following multiaddrs:"
    );
    const addrs = server.getMultiaddrs();
    if (addrs.length === 0) {
      console.warn(
        "No addresses are being returned by server.getMultiaddrs()."
      );
    } else {
      console.info(addrs.map((ma) => ma.toString()).join("\n"));
    }
  } catch (err) {
    console.error("Failed to start the server:", err);
    process.exit(1);
  }
}

// CustomEvent polyfill for Node.js environment
if (typeof globalThis.CustomEvent !== "function") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(event, params) {
      params = params || { bubbles: false, cancelable: false, detail: null };
      super(event, params);
      this.detail = params.detail;
    }
  };
}

main().catch((err) => {
  console.error("An error occurred:", err);
  process.exit(1);
});
