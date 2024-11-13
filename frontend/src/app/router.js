import { createRouter, createWebHistory } from 'vue-router';
import Network from './../pages/network.vue';
import Nodes from './../pages/nodes.vue';
import Logs from './../pages/logs.vue';

const routes = [
    {
        path: '/network',
        name: 'Network',
        component: Network,
    },
    {
        path: '/nodes',
        name: 'Nodes',
        component: Nodes,
    },
    {
        path: '/logs',
        name: 'Logs',
        component: Logs,
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;