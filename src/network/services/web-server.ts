import express, { Request, Response } from "express";
import path from "path";
import http from "http";
import { setupSocketIO } from "./socket-service.js";
import { NetworkService } from "./network-service.js";
import ConfigLoader from "../../common/config-loader.js";
import walletRoutes from "../../wallet/api/wallet-routes.js";
import blockChainRoutes from "../../blockchain/api/blockchain-routes.js";
const __dirname = path.resolve();

export function createWebServer(ns: NetworkService): http.Server {
  const app = express();
  app.use("/api/wallet", walletRoutes);
  app.use("/api/blockchain", blockChainRoutes);

  const config = ConfigLoader.getInstance().getConfig();
  const port = config.wsport ?? 3006;
  const server = http.createServer(app);
  setupSocketIO(server, ns);

  app.use(express.static(path.join(__dirname, "./dist/frontend")));

  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "./dist/frontend", "index.html"));
  });

  server.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
  });

  return server;
}
