import { io } from 'socket.io-client';
import { useDebugInfoStore } from './../entities/debug-info/model/debug-store';
import { useNodeInfoStore } from './../entities/node-info/model/node-store';
import { useBlockchainStore } from './../entities/blockchain/model/blockchain-store';
let socket;

export function initializeSocket() {
    const debugInfoStore = useDebugInfoStore();
    const nodeInfoStore = useNodeInfoStore();
    const blockchainStore = useBlockchainStore();
    if (!socket) {
        socket = io();
        //socket = io('http://localhost:3000', { transports: ['websocket'] });

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
        socket.on('delegate', (data) => {
            blockchainStore.updateDelegate(data);
        });
    }

    return socket;
}