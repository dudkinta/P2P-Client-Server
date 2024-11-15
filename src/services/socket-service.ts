import { Node } from "./../models/node.js";
import { Server, Socket } from "socket.io";
import { LogLevel } from "./../helpers/log-level.js";
import { NetworkService } from "./nerwork-service.js";
let io: Server | undefined = undefined;
let networkService: NetworkService | undefined = undefined;
export function setupSocketIO(server: any, ns: NetworkService) {
  networkService = ns;
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log("Клиент подключен:", socket.id);

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

export function sendNodes(nodes: Node[]) {
  if (io) {
    const rootNodeInfo = networkService?.getRoot();
    if (rootNodeInfo) {
      nodes.push(rootNodeInfo.root);
    }
    io.emit(
      "nodes",
      nodes.map((n) => n.toJSON())
    );
    if (rootNodeInfo) {
      io.emit("connections", rootNodeInfo.connections);
    }
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
