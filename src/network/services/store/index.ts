import { StoreService as StoreServiceClass } from "./store.js";
import type {
  ComponentLogger,
  PeerStore,
  TypedEventTarget,
  Libp2pEvents,
} from "@libp2p/interface";
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
  runOnPeerConnect?: boolean;
  timeout?: number;
}

export interface StoreServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  peerStore: PeerStore;
  logger: ComponentLogger;
  events: TypedEventTarget<Libp2pEvents>;
}

export function store(
  init: StoreServiceInit = {}
): (components: StoreServiceComponents) => StoreService {
  return (components) => new StoreServiceClass(components, init);
}
