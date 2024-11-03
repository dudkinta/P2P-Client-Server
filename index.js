import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import {
  circuitRelayServer,
  circuitRelayTransport,
} from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { createLibp2p } from "libp2p";
import {
  createFromProtobuf,
  createEd25519PeerId,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { pipe } from "it-pipe";
import { fromString } from "uint8arrays";
import fs from "fs/promises";
import path from "path";

const PEER_ID_FILE = path.resolve("peer-id.bin");
const PORT = 6006;
const ROLES = ["chainrelay"];
const ROLE_PROTOCOL = "/chain/roles/1.0.0";
const PEER_LIST_PROTOCOL = "/chain/peers/1.0.0";
const PING_PROTOCOL = "/chain/ping/1.0.0";

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
      listen: [`/ip4/${listenIp}/tcp/${PORT}`],
    },
    transports: [
      tcp(),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      identifyPush: identifyPush(),
      ping: ping(),
      circuitRelay: circuitRelayServer(),
      aminoDHT: kadDHT({
        clientMode: false,
        serverMode: true,
        protocol: "/ipfs/kad/1.0.0",
        peerInfoMapper: removePrivateAddressesMapper
      }),
    }
  });

  server.handle(ROLE_PROTOCOL, async ({ stream }) => {
    await pipe([fromString(JSON.stringify(ROLES))], stream);
  });
  server.handle(PING_PROTOCOL, async ({ stream }) => {
    await pipe([fromString("PONG")], stream);
  });

  server.handle(PEER_LIST_PROTOCOL, async ({ stream }) => {
    const connections = server.getConnections();

    const peerData = connections.map((conn) => ({
      peerId: conn.remotePeer.toString(),
      address: conn.remoteAddr.toString(),
    }));

    await pipe([fromString(JSON.stringify(peerData))], stream);
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
