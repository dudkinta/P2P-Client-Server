import { P2PClient } from "./p2p-сlient.js";
import { NetworkService } from "./services/nerwork-service.js";
import ConfigLoader from "./helpers/config-loader.js";
import pkg from "debug";
const { debug } = pkg;
import * as readline from "readline";

// Инициализация логгеров при запуске
debug.enable(process.env.DEBUG || "");

// Настройка интерфейса для ввода команд
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (input: string) => {
  if (input.startsWith("debug ")) {
    const namespaces = input.slice(6);
    debug.enable(namespaces);
    console.log(`Включено логгирование для: ${namespaces}`);
  } else if (input === "debug off") {
    debug.disable();
    console.log("Логгирование отключено");
  } else {
    console.log(`Неизвестная команда: ${input}`);
  }
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
