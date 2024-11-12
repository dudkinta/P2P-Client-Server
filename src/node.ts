import { P2PClient } from "./p2p-сlient.js";
import { NetworkService } from "./services/nerwork-service.js";
import ConfigLoader from "./helpers/config-loader.js";
import path from "path";
import { fileURLToPath } from "url";
import express, { Request, Response } from "express";
import http from "http";
import { Socket, Server } from "socket.io";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // URL вашего фронтенд-сервера
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket: Socket) => {
  console.log("Клиент подключен:", socket.id);

  // Отправка приветственного сообщения клиенту
  socket.emit("welcome", "Добро пожаловать на сервер Socket.IO");

  // Отправка данных на клиент с интервалом
  setInterval(() => {
    socket.emit("data", { message: "Обновленные данные с сервера" });
  }, 5000);

  socket.on("client-event", (data) => {
    console.log("Сообщение от клиента:", data);
  });

  socket.on("disconnect", () => {
    console.log("Клиент отключен:", socket.id);
  });
});
// Укажите путь к собранным статическим файлам Vue
app.use(express.static(path.join(__dirname, "../dist/frontend")));

// Настройка маршрутов для отдачи index.html при любых запросах
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../frontend/dist", "index.html"));
});
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
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
