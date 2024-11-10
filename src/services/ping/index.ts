import { PingService as PingServiceClass } from "./ping.js";
import type { AbortOptions, ComponentLogger, PeerId } from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";
import type { Multiaddr } from "@multiformats/multiaddr";

export interface PingService {
  ping(addrr: Multiaddr, options?: AbortOptions): Promise<number>;
}

export interface PingServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  timeout?: number;
}

export interface PingServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  logger: ComponentLogger;
}

export function ping(
  init: PingServiceInit = {}
): (components: PingServiceComponents) => PingService {
  return (components) => new PingServiceClass(components, init);
}
