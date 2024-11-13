import express, { Request, Response } from "express";
import path from "path";
import http from "http";
import { setupSocketIO } from "./socket-service.js";

const __dirname = path.resolve();

export function createServer(): http.Server {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(app);
  setupSocketIO(server);

  app.use(express.static(path.join(__dirname, "./dist/frontend")));

  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "./dist/frontend", "index.html"));
  });

  server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
  });

  return server;
}
