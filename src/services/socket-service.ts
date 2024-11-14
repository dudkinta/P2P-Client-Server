import { Node } from "./../models/node.js";
import { Server, Socket } from "socket.io";
import { LogLevel } from "./../helpers/log-level.js";
import { NetworkService } from "./nerwork-service.js";
let io: Server | undefined = undefined;

export function setupSocketIO(server: any, ns: NetworkService) {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log("Клиент подключен:", socket.id);

    socket.on("getroot", () => {
      const root = ns.getRoot();
      if (root) {
        socket.emit("root", root.toJSON());
      }
    });

    socket.on("disconnect", () => {
      console.log("Клиент отключен:", socket.id);
    });
  });

  return io;
}

// Функция для отправки логов
export function sendDebug(
  service: string,
  level: LogLevel,
  timestamp: Date,
  logMessage: string
) {
  if (io) {
    io.emit("logs", {
      timestamp: timestamp,
      service: service,
      level: level,
      message: logMessage,
    });
  }
}

export function addNode(node: Node) {
  if (io) {
    io.emit("addnode", node.toJSON());
  }
}
export function removeNode(node: Node) {
  if (io) {
    io.emit("removenode", node.toJSON());
  }
}
export function updateNode(node: Node) {
  if (io) {
    io.emit("updatenode", node.toJSON());
  }
}
/*
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
}*/
