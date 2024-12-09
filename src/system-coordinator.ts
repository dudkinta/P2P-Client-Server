import { P2PClient } from "./network/p2p-сlient.js";
import { BlockChain } from "./blockchain/blockchain.js";
import { createWebServer } from "./network/services/web-server.js";
import { NetworkService } from "./network/services/network-service.js";
import ConfigLoader from "./common/config-loader.js";
import { Wallet } from "./wallet/wallet.js";
import {
  MessageChain,
  MessageType,
} from "./network/services/messages/index.js";
import { Delegator } from "./delegator/delegator.js";

export class SystemCoordinator {
  private config = ConfigLoader.getInstance().getConfig();
  private networkService: NetworkService;
  private blockChain: BlockChain;
  private delegator: Delegator;
  constructor() {
    let port = this.config.port ?? 6006;
    const listenAddrs = this.config.listen ?? ["/ip4/0.0.0.0/tcp/"];
    this.networkService = new NetworkService(
      new P2PClient(listenAddrs, port, this.config.nodeType)
    );
    this.blockChain = BlockChain.getInstance();
    this.delegator = new Delegator();
    createWebServer(this.networkService);

    Wallet.onEvent("wallet:change", async (wallet: Wallet) => {
      const message = new MessageChain(
        MessageType.WALLET,
        wallet.toWalletPublicKey()
      );
      await this.networkService.broadcastMessage(message);
    });

    this.blockChain.on("message:newBlock", async (message) => {
      await this.networkService.broadcastMessage(message);
    });
    this.blockChain.on("message:request", async (message) => {
      await this.networkService.broadcastMessage(message);
    });
    this.blockChain.on("message:chain", async (message) => {
      await this.networkService.sendMessageToConnection(message);
    });
    this.networkService.on("message:blockchainData", async (message) => {
      this.blockChain.addBlockchainData(message.value);
    });
    this.networkService.on("message:addValidator", async (event) => {
      this.delegator.addDelegate(event);
    });
    this.networkService.on("message:removeValidator", async (message) => {
      this.delegator.removeDelegate(message);
    });
  }

  public async startAsync(): Promise<void> {
    await this.networkService.startAsync().catch((err) => {
      console.log("Failed to start network service", err);
    });
    await this.blockChain.startAsync(this.delegator).catch((err) => {
      console.log("Failed to start blockchain", err);
    });
    console.log("Blockchain initialized");
  }
}
