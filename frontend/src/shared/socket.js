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

        });

        socket.on('logs', (data) => {
            debugInfoStore.addLine(data);
        });
        socket.on('nodes', (data) => {
            nodeInfoStore.updateNodes(data);
        });
        socket.on('connections', (data) => {
            nodeInfoStore.updateConnections(data);
        });
    }

    return socket;
}