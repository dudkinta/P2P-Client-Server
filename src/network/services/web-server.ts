import { injectable, inject } from "inversify";
import { TYPES } from "../../types.js";
import express, { Request, Response } from "express";
import path from "path";
import http from "http";
import { setupSocketIO } from "./socket-service.js";
import { NetworkService } from "./network-service.js";
import { ConfigLoader } from "../../common/config-loader.js";
import { BlockChainRoutesFactory } from "../../blockchain/api/blockchain-routes.js";
import { WalletRoutesFactory } from "../../wallet/api/wallet-routes.js";
const __dirname = path.resolve();

@injectable()
export class WebServer {
  private app: express.Application;
  private server: http.Server;
  private port: number;
  constructor(@inject(TYPES.NetworkService) networkService: NetworkService,
    @inject(TYPES.ConfigLoader) configLoader: ConfigLoader,
    @inject(TYPES.BlockChainRoutesFactory) private blockChainRouteFactory: BlockChainRoutesFactory,
    @inject(TYPES.WalletRoutesFactory) private walletRouteFactory: WalletRoutesFactory) {
    this.app = express();
    this.setupRoutes();
    this.server = http.createServer(this.app);

    const config = configLoader.getConfig();
    this.port = config.wsport ?? 3006;

    // Настройка Socket.IO
    setupSocketIO(this.server, networkService);
  }

  // Настройка маршрутов
  private setupRoutes(): void {
    this.app.use("/api/wallet", this.walletRouteFactory.create());
    this.app.use("/api/blockchain", this.blockChainRouteFactory.create());

    this.app.use(express.static(path.join(__dirname, "./dist/frontend")));

    this.app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, "./dist/frontend", "index.html"));
    });
  }

  // Асинхронный метод запуска
  public async startAsync(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`Сервер запущен на http://localhost:${this.port}`);
        resolve();
      });

      this.server.on("error", (err) => {
        console.error("Ошибка при запуске сервера:", err);
        reject(err);
      });
    });
  }

  // Метод остановки сервера
  public async stopAsync(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          console.error("Ошибка при остановке сервера:", err);
          reject(err);
        } else {
          console.log("Сервер остановлен.");
          resolve();
        }
      });
    });
  }
}
