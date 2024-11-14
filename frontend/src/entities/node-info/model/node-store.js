import { defineStore } from 'pinia';

export const useNodeInfoStore = defineStore('node-info', {
    state: () => ({
        nodes: new Map(),
    }),
    actions: {
        addNode(node) {
            const key = node.peerId;
            this.nodes.set(key, node);
        },
        removeNode(node) {
            const key = node.peerId;
            this.nodes.delete(key);
        },
        updateNode(node) {
            const key = node.peerId;
            this.nodes.set(key, node);
        }
    },
});