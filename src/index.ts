import 'reflect-metadata';
import { Container, injectable, inject } from 'inversify';
import { TYPES } from './types.js';
import { ConfigLoader } from "./common/config-loader.js";
import { P2PClient } from './network/p2p-сlient.js';
import { NetworkService } from './network/services/network-service.js';
import { WebServer } from './network/services/web-server.js';
import { dbContext } from './blockchain/db-context/database.js';
import { BlockChain } from './blockchain/blockchain.js';
import { WalletRoutesFactory } from './wallet/api/wallet-routes.js';
import { BlockChainRoutesFactory } from './blockchain/api/blockchain-routes.js';
import { MessagesServiceComponents, MessagesServiceInit } from './network/services/messages/index.js';
import { MessagesService } from './network/services/messages/messages.js';
import { p2pClientHelper } from './network/helpers/libp2p-helper.js';
import { Statistic } from './blockchain/statistic.js';
// Основной класс
@injectable()
class App {
  constructor(
    @inject(TYPES.NetworkService) private networkService: NetworkService,
    @inject(TYPES.WebServer) private webServer: WebServer,
    @inject(TYPES.BlockChain) private blockChain: BlockChain
  ) { }

  async start() {
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

(async () => {
  await ConfigLoader.initialize();
  // Конфигурация контейнера
  const container = new Container();
  container.bind<ConfigLoader>(TYPES.ConfigLoader).toDynamicValue(() => {
    return ConfigLoader.getInstance();
  });
  container.bind<NetworkService>(TYPES.NetworkService).to(NetworkService).inSingletonScope();
  container.bind<(components: MessagesServiceComponents) => MessagesService>(
    TYPES.MessagesServiceFactory
  ).toFactory((context) => {
    return (components: MessagesServiceComponents, init: MessagesServiceInit = {}) => {
      const blockChain = context.container.get<BlockChain>(TYPES.BlockChain);
      return new MessagesService(components, blockChain, init);
    };
  });
  container.bind<P2PClient>(TYPES.P2PClient).to(P2PClient).inSingletonScope();
  container.bind<WebServer>(TYPES.WebServer).to(WebServer).inSingletonScope();
  container.bind<dbContext>(TYPES.DbContext).to(dbContext).inSingletonScope();
  container.bind<BlockChain>(TYPES.BlockChain).to(BlockChain).inSingletonScope();
  container.bind<BlockChainRoutesFactory>(TYPES.BlockChainRoutesFactory).to(BlockChainRoutesFactory).inSingletonScope();
  container.bind<WalletRoutesFactory>(TYPES.WalletRoutesFactory).to(WalletRoutesFactory).inSingletonScope();
  container.bind<p2pClientHelper>(TYPES.p2pClientHelper).to(p2pClientHelper).inSingletonScope();
  container.bind<Statistic>(TYPES.Statistic).to(Statistic).inSingletonScope();
  container.bind(App).to(App);

  const app = container.get(App);
  await app.start();
})();


process.on("uncaughtException", (err) => {
  console.error("Unhandled exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled promise rejection at:", promise, "reason:", reason);
  process.exit(1);
});
