import { P2PClient } from "./p2p-сlient.js";
import { NetworkService } from "./services/nerwork-service.js";
import ConfigLoader from "./helpers/config-loader.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express, { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Указываем Express, где находить статические файлы Vue
app.use(express.static(path.join(__dirname, "public")));

// Обработка всех маршрутов и отправка файла index.html
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

async function main(): Promise<void> {
  await ConfigLoader.initialize();
  const networkService = new NetworkService(new P2PClient());
  await networkService.startAsync();
}

process.on("uncaughtException", (err) => {
  console.error("Unhandled exception:", err);
  process.exit(1); // Завершение процесса с кодом ошибки
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled promise rejection at:", promise, "reason:", reason);
  process.exit(1); // Завершение процесса с кодом ошибки
});

main();
