import { Server, Socket } from "socket.io";

export function setupSocketIO(server: any) {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173", // URL вашего фронтенд-сервера
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log("Клиент подключен:", socket.id);
    socket.emit("welcome", "Добро пожаловать на сервер Socket.IO");

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

  return io;
}
