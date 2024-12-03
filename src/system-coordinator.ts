import { P2PClient } from "./network/p2p-сlient.js";
import { BlockChain } from "./blockchain/blockchain.js";
import { createWebServer } from "./network/services/web-server.js";
import { NetworkService } from "./network/services/network-service.js";
import http from "http";
import ConfigLoader from "./common/config-loader.js";
import { Wallet } from "./wallet/wallet.js";
import {
  MessageChain,
  MessageType,
} from "./network/services/messages/index.js";
import { Validator } from "./validator/validator.js";

export class SystemCoordinator {
  private config = ConfigLoader.getInstance().getConfig();
  private networkService: NetworkService;
  private blockChain: BlockChain;
  private validator: Validator;
  constructor() {
    let port = this.config.port ?? 6006;
    const listenAddrs = this.config.listen ?? ["/ip4/0.0.0.0/tcp/"];
    this.networkService = new NetworkService(
      new P2PClient(listenAddrs, port, this.config.nodeType)
    );

    this.blockChain = BlockChain.getInstance();
    this.validator = new Validator();
    createWebServer(this.networkService);

    Wallet.onEvent("wallet:change", async (wallet: Wallet) => {
      await this.networkService.broadcastMessage(
        new MessageChain(MessageType.WALLET, wallet)
      );
    });
    this.blockChain.on("newmessage", async (message) => {
      await this.networkService.broadcastMessage(message);
    });
    this.networkService.on("message:blockchainData", async (message) => {
      this.blockChain.addBlockchainData(message.value);
    });
    this.networkService.on("message:addValidator", async (message) => {
      this.validator.addValidator(message);
    });
    this.networkService.on("message:removeValidator", async (message) => {
      this.validator.removeValidator(message);
    });
  }

  public async startAsync(): Promise<void> {
    await this.networkService.startAsync();
    //await this.blockChain.initAsync();
    console.log("Blockchain initialized");
  }
}
