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
                data: { id: key, label: 'root', isRoot: true } // Используем isRoot вместо root
            });
        },
        updateConnections(data) {
            const root = this.graphData.find((node) => node.data.isRoot);
            if (root) {
                const graphEdges = [];
                data.forEach((line) => {
                    const route = parseMultiaddr(line.remoteAddr);
                    if (route.direct !== undefined) {
                        const id = root.data.id + '-' + route.direct;
                        graphEdges.push({
                            data: {
                                id: id,
                                source: root.data.id,
                                target: route.direct,
                                label: line.remotePeer,
                                isLimits: line.limits !== undefined,
                                isEdge: true,
                                remoteAddr: line.remoteAddr
                            }
                        });
                        if (route.relay !== undefined) {
                            const relayId = route.direct + '-' + route.relay;
                            graphEdges.push({
                                data: {
                                    id: relayId,
                                    source: route.direct,
                                    target: route.relay,
                                    label: line.remotePeer,
                                    isLimits: line.limits !== undefined,
                                    isEdge: true,
                                    remoteAddr: line.remoteAddr
                                }
                            });
                        }
                    }

                });
                const edges = [...this.graphData.filter((item) => item.data.isEdge)];
                const forDelete = edges.filter((item) => {
                    const presentEdge = graphEdges.find((edge) => edge.data.remoteAddr === item.data.remoteAddr);
                    return !presentEdge;
                });
                forDelete.forEach((item) => {
                    const index = this.graphData.findIndex((dataItem) => dataItem.data.id === item.data.id);
                    if (index !== -1) {
                        this.graphData.splice(index, 1);
                        this.nodes.delete(item.data.id);
                    }
                });
                graphEdges.forEach((edge) => {
                    const index = this.graphData.findIndex((dataItem) => {
                        return dataItem.data.id === edge.data.id && dataItem.data.remoteAddr === edge.data.remoteAddr;
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
            const edges = [...this.graphData.filter((item) => item.data.isEdge)];
            const nodes = [...this.graphData.filter((item) => item.data.isNode)];
            const forDeleteEdges = edges.filter((item) => {
                const source = graphNodes.find((dataNode) => dataNode.data.id === item.data.source);
                const target = graphNodes.find((dataNode) => dataNode.data.id === item.data.target);
                return !source || !target;
            });
            const forDeleteNodes = nodes.filter((item) => {
                return !graphNodes.find((dataNode) => dataNode.data.id === item.data.id);
            });

            forDeleteEdges.forEach((item) => {
                const index = this.graphData.findIndex((dataItem) => dataItem.data.id === item.data.id && dataItem.data.remoteAddr === item.data.remoteAddr);
                if (index !== -1) {
                    this.graphData.splice(index, 1);
                }
            });
            forDeleteNodes.forEach((item) => {
                const index = this.graphData.findIndex((dataItem) => dataItem.data.id === item.data.id);
                if (index !== -1) {
                    this.graphData.splice(index, 1);
                    this.nodes.delete(item.data.id);
                }
            });
            graphNodes.forEach((dataNode) => {
                const index = this.graphData.findIndex((nodeItem) => nodeItem.data.id === dataNode.data.id);
                if (index === -1) {
                    this.graphData.push(dataNode);
                }
                else {
                    if (this.graphData[index].data.isRoot !== dataNode.data.isRoot) console.log('need update isRoot');//this.graphData[index].data.isRoot = dataNode.data.isRoot;
                    if (this.graphData[index].data.isNodeRole !== dataNode.data.isNodeRole) console.log('need update isNodeRole');//this.graphData[index].data.isNodeRole = dataNode.data.isNodeRole;
                    if (this.graphData[index].data.isRelayRole !== dataNode.data.isRelayRole) console.log('need update isRelayRole'); //this.graphData[index].data.isRelayRole = dataNode.data.isRelayRole;
                    if (this.graphData[index].data.isRoot !== dataNode.data.isRoot ||
                        this.graphData[index].data.isNodeRole !== dataNode.data.isNodeRole ||
                        this.graphData[index].data.isRelayRole !== dataNode.data.isRelayRole) {
                        this.graphData[index] = dataNode;
                    }
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