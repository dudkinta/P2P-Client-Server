import { Connection, PeerId } from "@libp2p/interface";

export class Relay {
  addrList: Set<string> = new Set();
  peerId: string;
  connection: Connection | undefined;
  constructor(peerId: string) {
    this.peerId = peerId;
  }

  toJSON(): string {
    return JSON.stringify(
      {
        peerId: this.peerId,
        addrList: Array.from(this.addrList),
        connection: this.connection?.remoteAddr.toString(),
        status: this.connection?.status,
      },
      null,
      2
    );
  }
}
