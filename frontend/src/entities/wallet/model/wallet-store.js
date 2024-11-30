import { defineStore } from 'pinia';

export const useWalletStore = defineStore('wallet', {
    state: () => ({
        wallets: [],
    }),
    actions: {
        addWallets(wallets) {
            for (const wallet of wallets) {
                this.addWallet(wallet);
            }
        },
        addWallet(wallet) {
            this.wallets.push(wallet);
        },
    }
});