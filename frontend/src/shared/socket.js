import { io } from 'socket.io-client';
import { useLogStore } from './../entities/logs/model/log-store';

let socket;

export function initializeSocket() {
    const logStore = useLogStore();

    if (!socket) {
        socket = io('http://localhost:3000');

        socket.on('connect', () => {
            console.log('Подключен к серверу Socket.IO');
        });

        socket.on('logs', (data) => {
            logStore.addLine(data);
        });
    }

    return socket;
}