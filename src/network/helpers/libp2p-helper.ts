import { createLibp2p, Libp2p } from "libp2p";
import { loadOrCreatePeerId } from "./peer-helper.js";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { tcp } from "@libp2p/tcp";
import {
  circuitRelayTransport,
  circuitRelayServer,
} from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { roles } from "../services/roles/index.js";
import { messages } from "../services/messages/index.js";
import { peerList } from "../services/peer-list/index.js";
import { maList } from "../services/multiadress/index.js";
import { store } from "../services/store/index.js";
import ConfigLoader from "../../common/config-loader.js";

export async function getRelayClient(
  lintenAddrs: string[],
  port: number
): Promise<Libp2p> {
  try {
    const config = ConfigLoader.getInstance().getConfig();
    const net = config.net;
    const privateKey = await loadOrCreatePeerId(`./data/${net}/peer-id.bin`);
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
          maxInboundStopStreams: 128,
          maxOutboundStopStreams: 128,
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
          maxInboundHopStreams: 128,
          maxOutboundStopStreams: 128,
          reservations: {
            maxReservations: 128,
            defaultDurationLimit: 600000,
            defaultDataLimit: BigInt(1 << 24),
          },
        }),
        pubsub: gossipsub({
          emitSelf:false,
          gossipFactor: 0.3,
        }),
        identify: identify(),
        identifyPush: identifyPush(),
        store: store(),
        roles: roles({
          roles: [config.roles.RELAY],
        }),
        peerList: peerList(),
        maList: maList(),
        messages: messages(),
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

    const privateKey = await loadOrCreatePeerId(
      `./data/${config.net}/peer-id.bin`
    );
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
          maxInboundStopStreams: 128,
          maxOutboundStopStreams: 128,
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
          maxInboundHopStreams: 128,
          maxOutboundStopStreams: 128,
          reservations: {
            maxReservations: 128,
            defaultDurationLimit: 600000,
            defaultDataLimit: BigInt(1 << 24),
          },
        }),
        pubsub: gossipsub({
          emitSelf:false,
          gossipFactor: 0.3,
        }),
        identify: identify(),
        identifyPush: identifyPush(),
        store: store(),
        roles: roles({
          roles: [config.roles.NODE],
        }),
        peerList: peerList(),
        maList: maList(),
        messages: messages(),
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
