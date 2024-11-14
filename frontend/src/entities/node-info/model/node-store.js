import { defineStore } from 'pinia';

export const useNodeInfoStore = defineStore('node-info', {
    state: () => ({
        nodes: new Map(),
        graphData: [],
        rootNode: null,
    }),
    actions: {
        addRootNode(node) {
            const key = node.peerId;
            this.rootNode = node;
            this.graphData.push({
                data: { id: key, label: 'root', root: true }
            });
        },
        addNode(node) {
            const key = node.peerId;
            console.log('addNode', key);
            if (node.isRoot) {
                this.rootNode = node;
            }
            if (!this.nodes.has(key)) {
                const label = '...' + key.slice(-7);
                this.graphData.push({
                    data: { id: key, label: label }
                });
            }
            this.nodes.set(key, node);
        },
        removeNode(node) {
            const key = node.peerId;
            this.nodes.delete(key);
            for (let i = this.graphData.length - 1; i >= 0; i--) {
                const element = this.graphData[i].data;
                if (element.id === key || element.source === key || element.target === key) {
                    this.graphData.splice(i, 1);
                }
            }
        },
        updateNode(node) {
            const key = node.peerId;
            if (!this.nodes.has(key)) {
                this.graphData.push({
                    data: { id: key, label: '...' + key.slice(-7) }
                });
                const idLink = `${this.rootNode.peerId}-${key}`;
                node.connections.forEach(() => {
                    this.graphData.push({
                        data: { id: idLink, source: this.rootNode.peerId, target: key }
                    });
                });
            }
            node.connectedPeers.forEach((peer) => {
                const peerId = peer.peerId;
                const nodeId = this.graphData.findIndex((element) => element.data.id === peerId);
                if (nodeId == -1) {
                    this.graphData.push({
                        data: { id: peerId, label: '...' }
                    });
                }
                const id = `${key}-${peerId}`;
                const index = this.graphData.findIndex((element) => element.data.id === id);
                if (index == -1) {
                    this.graphData.push({
                        data: { id: id, source: key, target: peerId }
                    });
                }
            });
            this.nodes.set(key, node);
        }
    },
});