import { io } from 'socket.io-client';

// Подключение к серверу socket.io
const socket = io('http://localhost:3000'); // Укажите порт вашего бэкенда

// Обработка событий
socket.on('connect', () => {
    console.log('Подключен к серверу Socket.IO');
});

socket.on('logs', (data) => {
    console.log('logs:', data);
});

export default socket;