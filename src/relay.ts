// Полифил для CustomEvent в Node.js
if (typeof global.CustomEvent === "undefined") {
  global.CustomEvent = class CustomEvent<T = any> extends Event {
    detail: T | null;

    constructor(
      event: string,
      params?: { bubbles?: boolean; cancelable?: boolean; detail?: T }
    ) {
      super(event, params);
      this.detail = params?.detail ?? null;
    }
  } as unknown as typeof CustomEvent;
}

import { P2PServer } from "./p2p-server.js";
import { RelayService } from "./services/relay-service.js";
import ConfigLoader from "./helpers/config-loader.js";
async function main(): Promise<void> {
  await ConfigLoader.initialize();
  const config = ConfigLoader.getInstance().getConfig();
  let port = config.port ?? 6006;
  const listenAddrs = config.listen ?? ["/ip4/0.0.0.0/tcp/"];
  const networkService = new RelayService(new P2PServer(port, listenAddrs));
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
