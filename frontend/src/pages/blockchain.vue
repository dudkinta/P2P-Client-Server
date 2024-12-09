<template>
  <div class="blockchain-page">
    <div class="delegate-list">
      <DelegateList />
    </div>
    <div class="block-list">
      <BlockList />
    </div>
  </div>
</template>
<script>
import BlockList from "./../widgets/blockchain/ui/list.vue";
import DelegateList from "./../widgets/blockchain/ui/delegates.vue";
export default {
  name: "Blockchain",
  components: {
    BlockList,
    DelegateList,
  },
};
</script>
<style>
.blockchain-page {
  display: flex;
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  height: 100vh; /* Используем всю высоту окна браузера */
}

.delegate-list {
  flex: 0 0 20%; /* Занимает 20% ширины */
  background-color: #f5f5f5; /* Для наглядности можно добавить цвет */
  padding: 10px;
  box-sizing: border-box;
  border-right: 1px solid #ddd; /* Разделительная линия */
}

.block-list {
  flex: 1; /* Занимает оставшееся пространство */
  padding: 10px;
  box-sizing: border-box;
}
</style>
