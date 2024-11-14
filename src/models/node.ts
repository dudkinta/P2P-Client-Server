import type { Connection, PeerId } from "@libp2p/interface";
export class Node {
  peerId: PeerId | undefined;
  connections: Set<Connection>;
  addresses: Set<string>;
  protocols: Set<string>;
  roles: Set<string>;
  constructor(peerId: PeerId | undefined, connection: Connection | undefined) {
    this.peerId = peerId;
    this.connections = new Set();
    if (connection) {
      this.connections.add(connection);
    }
    this.addresses = new Set();
    this.protocols = new Set();
    this.roles = new Set();
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

  toJSON(): string {
    return JSON.stringify({
      peerId: this.peerId,
      connections: Array.from(this.connections),
      addresses: Array.from(this.addresses),
      protocols: Array.from(this.protocols),
      roles: Array.from(this.roles),
    });
  }
}
