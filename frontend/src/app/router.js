import { createRouter, createWebHistory } from 'vue-router';
import Network from './../pages/network.vue';
import Nodes from './../pages/nodes.vue';
import DebugInfo from './../pages/debug-info.vue';

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
        path: '/debug-info',
        name: 'DebugInfo',
        component: DebugInfo,
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;