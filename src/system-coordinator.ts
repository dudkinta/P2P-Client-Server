import { injectable, inject } from 'inversify';
import { TYPES } from './types.js'
import { BlockChain } from "./blockchain/blockchain.js";
import { WebServer } from "./network/services/web-server.js";
import { NetworkService } from "./network/services/network-service.js";
import { Wallet } from "./wallet/wallet.js";
import {
  MessageChain,
  MessageType,
} from "./network/services/messages/index.js";

@injectable()
export class SystemCoordinator {
  constructor(
    @inject(TYPES.NetworkService) private networkService: NetworkService,
    @inject(TYPES.WebServer) private webServer: WebServer,
    @inject(TYPES.BlockChain) private blockChain: BlockChain) {

    Wallet.onEvent("wallet:change", async (wallet: Wallet) => {
      const publicKey = wallet.toWalletPublicKey().publicKey;
      if (publicKey) {
        const message = new MessageChain(
          MessageType.WALLET,
          { publicKey: publicKey }, ''
        );
        await this.networkService.broadcastMessage(message);
        await this.networkService.saveMetadata('publicKey', publicKey);
      }
    });
    Wallet.onEvent("wallet:remove", async (publicKey: string) => {
      //await this.networkService.saveMetadata('publicKay', undefined);
      await this.networkService.broadcastMessage(new MessageChain(MessageType.WALLET_REMOVE, { publicKey: publicKey }, ''));
    });
    this.blockChain.on("message:newBlock", async (message) => {
      await this.networkService.broadcastMessage(message);
    });
    this.blockChain.on("message:request", async (message) => {
      await this.networkService.broadcastMessage(message);
    });
    this.blockChain.on("message:chain", async (message) => {
      await this.networkService.sendMessageToConnection(message.sender, message); //возврат сообщения запрашиваемому пиру
    });
    this.blockChain.on("setHeadIndex", async () => {
      await this.networkService.saveMetadata('headIndex', this.blockChain.getHeadIndex().toString());
    });
    this.networkService.on("message:blockchainData", async (event) => {
      await this.blockChain.addBlockchainData(event.detail);
    });
    this.networkService.on("message:requestchain", async (event) => {
      await this.blockChain.addBlockchainData(event.detail);
    });
    this.networkService.on("message:headIndex", async (event) => {
      await this.blockChain.addBlockchainData(event.detail);
    });
  }

  public async startAsync(): Promise<void> {
    await this.networkService.startAsync().catch((err) => {
      console.log("Failed to start network service", err);
    });
    await this.blockChain.startAsync().catch((err) => {
      console.log("Failed to start blockchain", err);
    });
    await this.webServer.startAsync();
    console.log("Blockchain initialized");
  }
}
