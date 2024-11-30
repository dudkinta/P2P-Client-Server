<template>
  <main class="wallet-details">
    <div v-if="wallet" class="details-box">
      <h2>Детали кошелька</h2>
      <p><strong>Имя:</strong> {{ wallet.name }}</p>
      <p><strong>Public Key:</strong> {{ wallet.publicKey }}</p>
      <p><strong>Баланс:</strong> {{ wallet.balance }} ₽</p>
      <button class="btn btn-primary" @click="openTransactionModal">
        Создать транзакцию
      </button>
    </div>
    <div v-else>
      <p>Выберите кошелек для просмотра деталей.</p>
    </div>
  </main>
</template>

<script>
export default {
  name: "CurrentWallet",
  props: {
    wallet: Object | undefined,
  },

  methods: {
    openTransactionModal() {
      console.log("Открыть модальное окно для создания транзакции");
    },
  },
};
</script>

<style scoped>
.wallet-details,
.transactions {
  flex: 1;
}
.details-box {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 5px;
  background-color: #fff;
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
</style>
