<template>
  <div class="current-wallet">
    <label for="wallet-dropdown">Выберите кошелек:</label>
    <select id="wallet-dropdown" v-model="selectedWallet">
      <option v-for="wallet in wallets" :key="wallet.publicKey" :value="wallet">
        {{ wallet.name }} - {{ wallet.subname }}
      </option>
    </select>
    <div v-if="selectedWallet">
      <h3>Выбранный кошелек:</h3>
      <div>Public Key: {{ selectedWallet.publicKey }}</div>
      <div>Имя: {{ selectedWallet.name }}</div>
      <div>Подимя: {{ selectedWallet.subname }}</div>
    </div>
  </div>
</template>

<script>
import { useWalletStore } from "../../../entities/wallet/model/wallet-store";
import WalletApi from "./../api/wallet-api";
export default {
  name: "CurrentWallet",
  data() {
    return {
      wallets: [],
      walletApi: new WalletApi(),
      selectedWallet: null,
    };
  },
  created() {
    this.loadWallets();
  },
  watch: {
    selectedWallet(wallet) {
      if (wallet) {
        this.useWallet(wallet);
      }
    },
  },
  methods: {
    async loadWallets() {
      try {
        const response = await this.walletApi.getWallets();
        const wallets = response;
        const walletStore = useWalletStore();
        walletStore.addWallets(wallets); // Обновляем данные в хранилище, если необходимо
        this.wallets = wallets;
        console.log("Кошельки:", response);
      } catch (error) {
        if (error.response && error.response.status === 400) {
          console.warn("Ошибка 400: Кошельки не найдены.");
        } else if (error.response && error.response.status === 500) {
          console.error("Ошибка 500: Внутренняя ошибка сервера.");
        } else {
          console.error("Ошибка загрузки кошельков:", error);
        }
      }
    },
    async useWallet(wallet) {
      console.log("Выбран кошелек:", wallet);
      try {
        const response = await this.walletApi.useWallet(wallet);
      } catch (error) {
        if (error.response && error.response.status === 400) {
          console.warn("Ошибка 400: Кошелек не найден.");
        } else if (error.response && error.response.status === 500) {
          console.error("Ошибка 500: Внутренняя ошибка сервера.");
        } else {
          console.error("Ошибка выбора кошелька:", error);
        }
      }
    },
  },
};
</script>

<style scoped></style>
