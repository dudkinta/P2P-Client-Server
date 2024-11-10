import { RolesService as RolesServiceClass } from "./roles.js";
import type {
  AbortOptions,
  ComponentLogger,
  Connection,
} from "@libp2p/interface";
import type { ConnectionManager, Registrar } from "@libp2p/interface-internal";

export interface RolesService {
  roles(connection: Connection, options?: AbortOptions): Promise<string>;
}

export interface RolesServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  timeout?: number;
  roles?: string[];
}

export interface RolesServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  logger: ComponentLogger;
}

export function roles(
  init: RolesServiceInit = {}
): (components: RolesServiceComponents) => RolesService {
  return (components) => new RolesServiceClass(components, init);
}
