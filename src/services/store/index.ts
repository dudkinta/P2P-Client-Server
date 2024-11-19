import { StoreService as StoreServiceClass } from "./store.js";
import type {
  AbortOptions,
  ComponentLogger,
  Connection,
  PeerStore,
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";

export interface StoreService {
  getStore(connection: Connection, options?: AbortOptions): Promise<string>;
}

export interface StoreServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  timeout?: number;
}

export interface StoreServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  peerStore: PeerStore;
  logger: ComponentLogger;
}

export function store(
  init: StoreServiceInit = {}
): (components: StoreServiceComponents) => StoreService {
  return (components) => new StoreServiceClass(components, init);
}
