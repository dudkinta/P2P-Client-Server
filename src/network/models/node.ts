import type { Connection, PeerId } from "@libp2p/interface";
export class Node {
  peerId: PeerId | undefined;
  connections: Set<Connection>;
  store: Map<string, string>;
  addresses: Set<string>;
  protocols: Set<string>;
  roles: Set<string>;
  isRoot: boolean;
  constructor(peerId: PeerId | undefined, connection: Connection | undefined) {
    this.peerId = peerId;
    this.connections = new Set();
    if (connection) {
      this.connections.add(connection);
    }
    this.store = new Map();
    this.addresses = new Set();
    this.protocols = new Set();
    this.roles = new Set();
    this.isRoot = false;
  }

  isConnect(): boolean {
    if (this.connections.size == 0) return false;
    return (
      Array.from(this.connections).filter((conn) => conn.status == "open")
        .length > 0
    );
  }

  getOpenedConnection(): Connection | undefined {
    if (this.connections.size == 0) return undefined;

    const allConnections = Array.from(this.connections);
    for (const conn of allConnections) {
      if (conn.status === "open" && conn.direction == "outbound") {
        return conn;
      }
    }
    for (const conn of allConnections) {
      if (conn.status === "open" && conn.direction == "inbound") {
        return conn;
      }
    }
    return undefined;
  }

  getOpenedConnections(): Connection[] | undefined {
    if (this.connections.size == 0) return undefined;

    const allConnections = Array.from(this.connections).filter(
      (conn) => conn.status === "open"
    );
    return allConnections;
  }

  setStore(store: Map<string, string>) {
    [...store].forEach(([key, value]) => {
      this.store.set(key, value);
    });
  }

  toJSON(): string {
    return JSON.stringify({
      peerId: this.peerId?.toString(),
      connections: Array.from(this.connections),
      store: this.store,
      addresses: Array.from(this.addresses),
      protocols: Array.from(this.protocols),
      roles: Array.from(this.roles),
      isRoot: this.isRoot,
    });
  }
}
