import { PeerListService as PeerListServiceClass } from './peer-list.js';

export function peerList(init = {}) {
  return (components) => new PeerListServiceClass(components, init);
}