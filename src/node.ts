import { P2PClient } from "./p2p-сlient.js";
import { NetworkService } from "./services/nerwork-service.js";
import ConfigLoader from "./helpers/config-loader.js";
import { createServer } from "./services/web-server.js";

async function main(): Promise<void> {
  await ConfigLoader.initialize();
  const networkService = new NetworkService(new P2PClient());
  const argv = process.argv.slice(2);
  if (!argv.includes("--no-webserver")) {
    createServer(networkService);
  }
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
