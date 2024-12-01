import { P2PClient } from "./network/p2p-сlient.js";
import { BlockChain } from "./blockchain/blockchain.js";
import { createWebServer } from "./network/services/web-server.js";
import { NetworkService } from "./network/services/network-service.js";
import http from "http";
import ConfigLoader from "./common/config-loader.js";

export class SystemCoordinator {
  private config = ConfigLoader.getInstance().getConfig();
  private networkService: NetworkService;
  private blockChain: BlockChain;
  private webServer: http.Server;
  constructor() {
    let port = this.config.port ?? 6006;
    const listenAddrs = this.config.listen ?? ["/ip4/0.0.0.0/tcp/"];
    this.networkService = new NetworkService(
      new P2PClient(listenAddrs, port, this.config.nodeType)
    );
    this.blockChain = BlockChain.getInstance();
    this.webServer = createWebServer(this.networkService);
  }

  public async startAsync(): Promise<void> {
    await this.networkService.startAsync();
  }
}
