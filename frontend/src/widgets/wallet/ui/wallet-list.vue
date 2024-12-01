<template>
  <aside class="wallet-list">
    <h2>Ваши кошельки</h2>
    <select id="wallet-dropdown" v-model="selectedWallet">
      <option
        v-for="wallet in wallets"
        :key="wallet.publicKey"
        :value="wallet"
        class="wallet-box"
      >
        {{ wallet.name }} / {{ wallet.subname }}
      </option>
    </select>
  </aside>
</template>
<script>
import WalletApi from "./../api/wallet-api";
export default {
  name: "WalletList",
  props: {
    wallets: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      walletApi: new WalletApi(),
      selectedWallet: null,
    };
  },
  created() {
    this.loadWallets();
    this.getCurrentWallet();
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
        this.$emit("load-wallets", response);
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
    async getCurrentWallet() {
      try {
        const response = await this.walletApi.getCurrentWallet();
        this.selectedWallet = response;
        this.$emit("wallet-selected", response);
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
      try {
        await this.walletApi.useWallet(wallet);
        this.selectedWallet = wallet;
        this.$emit("wallet-selected", wallet);
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
<style scoped>
.wallet-list,
.wallet-box {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 5px;
  background-color: #fff;
}
</style>
