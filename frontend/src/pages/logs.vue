<template>
  <Filter />
  <LogsList />
</template>
<script>
import LogsList from "./../widgets/logs/ui/list.vue";
import Filter from "./../widgets/logs/ui/filter.vue";
export default {
  name: "Logs",
  components: {
    LogsList,
    Filter,
  },
};
</script>
<style scoped></style>
