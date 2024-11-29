import { createRouter, createWebHistory } from 'vue-router';
import Nodes from './../pages/nodes.vue';
import DebugInfo from './../pages/debug-info.vue';
import Wallet from './../pages/wallet.vue';

const routes = [
    {
        path: '/wallet',
        name: 'Wallet',
        component: Wallet,
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