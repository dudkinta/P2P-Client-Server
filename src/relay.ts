import { RelayService } from "./services/relay-service.js";
import ConfigLoader from "./helpers/config-loader.js";
import { P2PClient } from "./p2p-сlient.js";
async function main(): Promise<void> {
  await ConfigLoader.initialize();
  const config = ConfigLoader.getInstance().getConfig();
  let port = config.port ?? 6006;
  const listenAddrs = config.listen ?? ["/ip4/0.0.0.0/tcp/"];
  const networkService = new RelayService(
    new P2PClient(listenAddrs, port, config.roles.RELAY)
  );
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
