<template>
  <div class="wallet">
    <CurrentWallet />
    <CreateWallet v-if="wallets.length == 0" />
  </div>
</template>
<script>
import CurrentWallet from "./../widgets/wallet/ui/current-wallet.vue";
import { useWalletStore } from "./../entities/wallet/model/wallet-store";
import CreateWallet from "../widgets/wallet/ui/create-wallet.vue";
export default {
  name: "Wallet",
  components: {
    CurrentWallet,
    CreateWallet,
  },
  data() {
    return {
      wallets: useWalletStore().wallets,
    };
  },
};
</script>
<style scoped></style>
