import { defineStore } from 'pinia';


export const useNodeInfoStore = defineStore('node-info', {
    state: () => ({
        nodes: new Map(),
        graphData: [],
    }),
    actions: {
        addRootNode(node) {
            const key = node.peerId;
            this.rootNode = node;
            this.graphData.push({
                data: { id: key, label: 'root', root: true }
            });
        },
        updateConnections(data) {
            const root = this.graphData.find((node) => node.data.isRoot);
            if (root) {
                const graphEdges = [];
                data.forEach((line) => {
                    const route = parseMultiaddr(line.remoteAddr);
                    if (route.direct != undefined) {
                        const id = root.data.id + '-' + route.direct;
                        graphEdges.push({
                            data: {
                                id: id,
                                source: root.data.id,
                                target: route.direct,
                                label: line.remotePeer,
                                isLimits: line.limits != undefined,
                                isEdge: true,
                                remoteAddr: line.remoteAddr
                            }
                        });
                        if (route.relay != undefined) {
                            const id = route.direct + '-' + route.relay;
                            graphEdges.push({
                                data: {
                                    id: id,
                                    source: route.direct,
                                    target: route.relay,
                                    label: line.remotePeer,
                                    isLimits: line.limits != undefined,
                                    isEdge: true,
                                    remoteAddr: line.remoteAddr
                                }
                            });
                        }
                    }

                });
                const forDelete = this.graphData.filter((data) => {
                    return data.isEdge && (!graphEdges.find((edge) => edge.data.id == data.data.id && edge.data.remoteAddr == data.data.remoteAddr));
                });
                forDelete.forEach((node) => {
                    const index = this.graphData.findIndex((data) => data.data.id == node.data.id);
                    this.graphData.splice(index, 1);
                    this.nodes.delete(node.data.id);
                });
                graphEdges.forEach(edge => {
                    const index = this.graphData.findIndex((data) => {
                        return edge.data.id === data.data.id && edge.data.remoteAddr === data.data.remoteAddr;
                    });
                    if (index === -1) {
                        this.graphData.push(edge);
                    }
                });
            }
        },
        updateNodes(data) {
            const graphNodes = data.map((line) => {
                const node = JSON.parse(line);
                const key = node.peerId;
                this.nodes.set(key, node);
                return {
                    data: {
                        id: key,
                        label: node.isRoot ? 'root' : '...' + key.slice(-5),
                        isNode: true,
                        isRelayRole: node.roles.includes('chainrelay'),
                        isNodeRole: node.roles.includes('chainnode'),
                        isRoot: node.isRoot,
                    }
                };
            });
            console.log('updating');
            const forDelete = this.graphData.filter((node) => {
                return node.isNode && !graphNodes.find((data) => data.data.id == node.data.id);
            });
            console.log('forDelete', forDelete);
            forDelete.forEach((node) => {
                const index = this.graphData.findIndex((data) => data.data.id === node.data.id);
                this.graphData.splice(index, 1);
                this.nodes.delete(node.data.id);
            });
            graphNodes.forEach(data => {
                const index = this.graphData.findIndex((node) => node.data.id === data.data.id);
                if (index === -1) {
                    this.graphData.push(data);
                }
            });
        }
    },
});


function parseMultiaddr(str) {
    // Разделяем строку по "/p2p/"
    const parts = str.split('/p2p/');

    // Получаем directID, если он существует
    const directID = parts[1] ? parts[1].split('/')[0] : null;

    // Получаем relayID, если он существует
    const relayID = parts[2] ? parts[2].split('/')[0] : null;

    // Формируем результат
    const result = {};
    if (directID) {
        result.direct = directID;
    }
    if (relayID) {
        result.relay = relayID;
    }

    return result;
}