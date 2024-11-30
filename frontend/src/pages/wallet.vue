<template>
  <div class="wallet-page">
    <HeaderWallet @create-wallet="createWallet" />
    <WalletList
      :wallets="wallets"
      @load-wallets="onLoadWallets"
      @wallet-selected="selectWallet"
    />
    <CurrentWallet :wallet="selectedWallet" />
  </div>
</template>
<script>
import CurrentWallet from "./../widgets/wallet/ui/current-wallet.vue";
import HeaderWallet from "../widgets/wallet/ui/header-wallet.vue";
import WalletList from "../widgets/wallet/ui/wallet-list.vue";
import { useWalletStore } from "./../entities/wallet/model/wallet-store";
export default {
  name: "Wallet",
  components: {
    WalletList,
    CurrentWallet,
    HeaderWallet,
  },
  data() {
    return {
      wallets: [],
      selectedWallet: null,
    };
  },
  methods: {
    onLoadWallets(wallets) {
      const walletStore = useWalletStore();
      walletStore.addWallets(wallets);
      this.wallets = walletStore.wallets;
    },
    selectWallet(wallet) {
      this.selectedWallet = wallet;
    },
    createWallet(wallet) {
      const walletStore = useWalletStore();
      walletStore.addWallet(wallet);
      this.wallets = walletStore.wallets;
    },
  },
};
</script>
<style scoped>
.wallet-page {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
}
</style>
