import { Node } from "../models/node.js";
import { Server, Socket } from "socket.io";
import { LogLevel } from "../helpers/log-level.js";
import { NetworkService } from "./network-service.js";
import { DelegateEntry } from "./../../delegator/delegator.js";
let io: Server;
let networkService: NetworkService;
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

export function sendDelegate(
  command: "add" | "remove",
  delegate: DelegateEntry
) {
  if (io) {
    io.emit("delegate", {
      command: command,
      delegate: delegate,
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
