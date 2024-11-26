import { MultiaddressService as MultiaddressServiceClass } from "./multiaddresses.js";
import type {
  AbortOptions,
  ComponentLogger,
  Connection,
  PeerId,
} from "@libp2p/interface";
import type {
  ConnectionManager,
  AddressManager,
  Registrar,
} from "@libp2p/interface-internal";

export interface MultiaddressService {
  getMultiaddress(
    connection: Connection,
    options?: AbortOptions
  ): Promise<string>;
  getDirectMultiaddress(): Promise<string[]>;
}

export interface MultiaddressServiceInit {
  protocolPrefix?: string;
  maxInboundStreams?: number;
  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
  timeout?: number;
}

export interface MultiaddressServiceComponents {
  registrar: Registrar;
  addressManager: AddressManager;
  connectionManager: ConnectionManager;
  logger: ComponentLogger;
  peerId: PeerId;
}

export function maList(
  init: MultiaddressServiceInit = {}
): (components: MultiaddressServiceComponents) => MultiaddressService {
  return (components) => new MultiaddressServiceClass(components, init);
}
