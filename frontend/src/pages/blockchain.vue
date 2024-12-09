<template>
  <div class="blockchain-page">
    <BlockList />
  </div>
</template>
<script>
import BlockList from "./../widgets/blockchain/ui/list.vue";
export default {
  name: "Blockchain",
  components: {
    BlockList,
  },
};
</script>
<style>
.blockchain-page {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
}
</style>
