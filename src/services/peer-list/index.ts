import { PeerListService as PeerListServiceClass } from "./peer-list.js";
import type {
  AbortOptions,
  ComponentLogger,
  Connection,
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";

export interface PeerListService {
  getConnectedPeers(
    connection: Connection,
    options?: AbortOptions
  ): Promise<string>;
}

export interface PeerListServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  timeout?: number;
}

export interface PeerListServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  logger: ComponentLogger;
}

export function peerList(
  init: PeerListServiceInit = {}
): (components: PeerListServiceComponents) => PeerListService {
  return (components) => new PeerListServiceClass(components, init);
}
