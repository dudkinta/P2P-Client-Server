<template>
  <header class="header">
    <div class="container">
      <h1>Управление кошельками</h1>
      <div v-if="!isShowPrepare">
        <button class="btn btn-primary" @click="prepareWallet">
          Создать кошелек
        </button>
      </div>
      <div v-if="isShowPrepare" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <h3>Создание кошелька</h3>
          <input
            type="text"
            v-model="walletName"
            placeholder="Введите имя кошелька"
          />
          <button class="btn btn-primary" @click="createWallet">
            Создать кошелек
          </button>
          <button class="btn btn-secondary" @click="closeModal">Закрыть</button>
        </div>
      </div>
      <div class="balance">Общий баланс: {{ totalBalance }} ₽</div>
    </div>
  </header>
</template>
<script>
import WalletApi from "../api/wallet-api";
export default {
  name: "HeaderWallet",
  data() {
    return {
      totalBalance: 0,
      walletName: "",
      walletApi: new WalletApi(),
      isShowPrepare: false,
    };
  },
  methods: {
    async prepareWallet() {
      this.isShowPrepare = true;
    },
    async createWallet() {
      try {
        if (this.walletName === "") {
          console.log("Имя кошелька не может быть пустым");
          return;
        }
        const response = await this.walletApi.createWallet(this.walletName);
        console.log("Кошелек создан:", response);
        this.isShowPrepare = false;
        this.$emit("create-wallet", response);
      } catch (error) {
        console.error("Ошибка создания кошелька:", error.message || error);
      }
    },
    closeModal() {
      this.isShowPrepare = false;
    },
  },
};
</script>
<style scoped>
.header {
  background-color: #f4f4f4;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #ddd;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
.balance {
  font-weight: bold;
  font-size: 1.2em;
}
.btn {
  padding: 8px 12px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.9em;
}
.btn-primary {
  background-color: #007bff;
  color: #fff;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  width: 300px;
  max-width: 90%;
  text-align: center;
}
.modal input {
  padding: 8px;
  margin-bottom: 8px;
}
</style>
