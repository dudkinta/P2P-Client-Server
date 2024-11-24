import { StoreService as StoreServiceClass } from "./store.js";
import type { ComponentLogger, PeerStore } from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";

export interface StoreService {
  getStore(request: RequestStore): StoreItem[];
  putStore(storeItem: StoreItem): void;
}

export interface StoreItem {
  peerId: string;
  key: string;
  value: any;
  ttl: number;
  dt: number;
  recieved: number;
}

export interface RequestStore {
  key: string | undefined;
  peerId: string | undefined;
  dt: number | undefined;
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
