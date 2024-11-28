import { P2PClient } from "./network/p2p-сlient.js";
import { NetworkService } from "./network/services/network-service.js";
import ConfigLoader from "./common/config-loader.js";
import { createServer } from "./network/services/web-server.js";

async function main(): Promise<void> {
  await ConfigLoader.initialize();
  const config = ConfigLoader.getInstance().getConfig();

  let port = config.port ?? 6006;
  const listenAddrs = config.listen ?? ["/ip4/0.0.0.0/tcp/"];
  const networkService = new NetworkService(
    new P2PClient(listenAddrs, port, config.nodeType)
  );

  createServer(networkService);

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
