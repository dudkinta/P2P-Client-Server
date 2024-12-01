import ConfigLoader from "./common/config-loader.js";
import { SystemCoordinator } from "./system-coordinator.js";

async function main(): Promise<void> {
  await ConfigLoader.initialize();
  const coordinator = new SystemCoordinator();
  await coordinator.startAsync();
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
