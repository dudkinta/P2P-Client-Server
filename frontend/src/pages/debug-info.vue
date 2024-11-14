<template>
  <Filter />
  <LogsList />
</template>
<script>
import LogsList from "./../widgets/debug-info/ui/list.vue";
import Filter from "./../widgets/debug-info/ui/filter.vue";
export default {
  name: "DebugInfo",
  components: {
    LogsList,
    Filter,
  },
};
</script>
<style scoped></style>
