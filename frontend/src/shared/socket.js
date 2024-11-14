import { io } from 'socket.io-client';
import { useDebugInfoStore } from './../entities/debug-info/model/debug-store';
import { useNodeInfoStore } from './../entities/node-info/model/node-store';
let socket;

export function initializeSocket() {
    const debugInfoStore = useDebugInfoStore();
    const nodeInfoStore = useNodeInfoStore();
    if (!socket) {
        socket = io('http://localhost:3000');

        socket.on('connect', () => {
            socket.emit('getroot');
        });

        socket.on('logs', (data) => {
            debugInfoStore.addLine(data);
        });
        socket.on('root', (data) => {
            const root = JSON.parse(data);
            root.isRoot = true;
            nodeInfoStore.addRootNode(root);
        });
        socket.on('addnode', (data) => {
            const node = JSON.parse(data);
            nodeInfoStore.addNode(node);
        });
        socket.on('updatenode', (data) => {
            const node = JSON.parse(data);
            nodeInfoStore.updateNode(node);
        });
        socket.on('removenode', (data) => {
            const node = JSON.parse(data);
            nodeInfoStore.removeNode(node);
        });
    }

    return socket;
}