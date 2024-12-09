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
            if (this.wallets.find((w) => w.publicKey === wallet.publicKey)) {
                return;
            }
            this.wallets.push(wallet);
        },
    }
});