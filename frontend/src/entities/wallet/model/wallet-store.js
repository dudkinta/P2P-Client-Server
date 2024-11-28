import { defineStore } from 'pinia';

export const useWalletStore = defineStore('wallet', {
    state: () => ({
        wallets: [],
    }),
    actions: {
        addWallet(wallet) {
            this.logs.push(wallet);
        },
    },
});