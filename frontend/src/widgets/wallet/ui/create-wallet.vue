<template>
  <div>
    <div v-if="mnemonic == undefined" class="create-wallet">
      <div>Создайте новый кошелек</div>
      <div>
        <input
          type="text"
          v-model="walletName"
          placeholder="Введите имя кошелька"
        />
      </div>
      <button @click="createWallet">Создать кошелек</button>
    </div>
    <div v-else>
      {{ mnemonic }}
    </div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>
<script>
import WalletApi from "./../api/wallet-api";
export default {
  name: "CreateWallet",
  data() {
    return {
      mnemonic: undefined,
      walletName: "",
      error: "",
      walletApi: new WalletApi(),
    };
  },
  methods: {
    async createWallet() {
      try {
        if (this.walletName === "") {
          this.error = "Имя кошелька не может быть пустым";
          return;
        }
        const response = await this.walletApi.createWallet(this.walletName);
        this.mnemonic = response.data;
      } catch (error) {
        console.error("Ошибка создания кошелька:", error.message || error);
      }
    },
  },
};
</script>
<style scoped></style>
