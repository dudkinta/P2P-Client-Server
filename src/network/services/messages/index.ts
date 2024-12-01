import { MessagesService as MessagesServiceClass } from "./messages.js";
import type {
  ComponentLogger,
  PeerStore,
  TypedEventTarget,
  Libp2pEvents,
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";

export interface MessagesService {}

export interface MessageChain {
  peerId: string;
  key: string;
  value: any;
}

export interface MessagesServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  runOnPeerConnect?: boolean;
  timeout?: number;
}

export interface MessagesServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  peerStore: PeerStore;
  logger: ComponentLogger;
  events: TypedEventTarget<Libp2pEvents>;
}

export function messages(
  init: MessagesServiceInit = {}
): (components: MessagesServiceComponents) => MessagesService {
  return (components) => new MessagesServiceClass(components, init);
}
