// socket-service.ts
import { Server, Socket } from "socket.io";
import { LogLevel } from "./../helpers/log-level.js";
let io: Server | undefined = undefined; // Экземпляр io

export function setupSocketIO(server: any) {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log("Клиент подключен:", socket.id);

    socket.on("client-event", (data) => {
      console.log("Сообщение от клиента:", data);
    });

    socket.on("disconnect", () => {
      console.log("Клиент отключен:", socket.id);
    });
  });

  return io;
}

// Функция для отправки сообщений всем клиентам
export function sendDebug(
  service: string,
  level: LogLevel,
  logMessage: string
) {
  if (io) {
    io.emit("logs", { service: service, level: level, message: logMessage });
  } else {
    console.error("Socket.IO не инициализирован");
  }
}

// Функция для отправки сообщения конкретному клиенту по его ID
export function sendLogToClient(clientId: string, logMessage: string) {
  if (io) {
    const socketClient = io.sockets.sockets.get(clientId);
    if (socketClient) {
      socketClient.emit("log", { message: logMessage });
    } else {
      console.error(`Клиент с ID ${clientId} не найден`);
    }
  } else {
    console.error("Socket.IO не инициализирован");
  }
}
