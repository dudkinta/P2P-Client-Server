import { createLibp2p, Libp2p } from "libp2p";
import { loadOrCreatePeerId } from "./peer-helper.js";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { tcp } from "@libp2p/tcp";
import {
  circuitRelayTransport,
  circuitRelayServer,
} from "@libp2p/circuit-relay-v2";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { identify, identifyPush } from "@libp2p/identify";
import { ping } from "./../services/ping/index.js";
import { roles } from "./../services/roles/index.js";
import { peerList } from "./../services/peer-list/index.js";
import { maList } from "./../services/multiadress/index.js";
import ConfigLoader from "./config-loader.js";

export async function getRelayClient(
  lintenAddrs: string[],
  port: number
): Promise<Libp2p> {
  try {
    const config = ConfigLoader.getInstance().getConfig();

    const privateKey = await loadOrCreatePeerId("./data/peer-id.bin");
    if (!privateKey) {
      throw new Error("Error loading or creating Peer ID");
    }
    const addrs = lintenAddrs.map((addr: string) => `${addr}${port}`);
    const node = await createLibp2p({
      start: false,
      privateKey: privateKey,
      addresses: {
        listen: addrs,
      },
      transports: [
        tcp(),
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
          maxInboundHopStreams: 512,
          maxOutboundStopStreams: 515,
          reservations: {
            maxReservations: 512,
            defaultDurationLimit: 600000,
            defaultDataLimit: BigInt(1 << 24),
          },
        }),
        aminoDHT: kadDHT({
          peerInfoMapper: removePrivateAddressesMapper,
        }),
        identify: identify(),
        identifyPush: identifyPush(),
        ping: ping(),
        roles: roles({
          roles: [config.roles.RELAY],
        }),
        peerList: peerList(),
        maList: maList(),
      },
      connectionManager: {
        maxConnections: 128,
      },
    });
    return node;
  } catch (error) {
    throw new Error(`Error during createLibp2p: ${error}`);
  }
}

export async function getNodeClient(
  lintenAddrs: string[],
  port: number
): Promise<Libp2p> {
  try {
    const config = ConfigLoader.getInstance().getConfig();

    const privateKey = await loadOrCreatePeerId("./data/peer-id.bin");
    if (!privateKey) {
      throw new Error("Error loading or creating Peer ID");
    }

    const addrs = lintenAddrs.map((addr: string) => `${addr}${port}`);
    addrs.push("/p2p-circuit");
    const node = await createLibp2p({
      start: false,
      privateKey: privateKey,
      addresses: {
        listen: addrs,
      },
      transports: [
        tcp(),
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
        aminoDHT: kadDHT({
          peerInfoMapper: removePrivateAddressesMapper,
        }),
        identify: identify(),
        identifyPush: identifyPush(),
        ping: ping(),
        roles: roles({
          roles: [config.roles.NODE],
        }),
        peerList: peerList(),
        maList: maList(),
      },
      connectionManager: {
        maxConnections: 128,
      },
    });
    return node;
  } catch (error) {
    throw new Error(`Error during createLibp2p: ${error}`);
  }
}
