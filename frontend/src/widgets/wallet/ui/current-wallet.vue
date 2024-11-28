<template>
  <div class="current-wallet"></div>
</template>

<script>
import { useWalletStore } from "../../../entities/wallet/model/wallet-store";
export default {
  name: "CurrentWallet",
  data() {
    return {
      services: useWalletStore().wallets,
    };
  },
};
</script>

<style scoped></style>
