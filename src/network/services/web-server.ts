import express, { Request, Response } from "express";
import path from "path";
import http from "http";
import { setupSocketIO } from "./socket-service.js";
import { NetworkService } from "./network-service.js";
import ConfigLoader from "../../common/config-loader.js";
const __dirname = path.resolve();

export function createServer(ns: NetworkService): http.Server {
  const app = express();
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
