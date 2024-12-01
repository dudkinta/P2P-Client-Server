import { Node } from "./../network/models/node.js";
export class Validator {
  constructor(
    private peers: Node[],
    private requiredValidators: number
  ) {}

  /*selectValidators(): string[] {
    const now = Date.now();
    const eligiblePeers = this.peers
      .filter((peer) => now - peer.connectedSince > 60 * 60 * 1000)
      .sort(
        (a, b) =>
          a.lastValidation - b.lastValidation ||
          now - b.connectedSince - (now - a.connectedSince) ||
          b.stake - a.stake
      );

    const selected = eligiblePeers.slice(0, this.requiredValidators);
    selected.forEach((peer) => (peer.lastValidation = now));
    return selected.map((peer) => peer.address);
  }
}*/
}
