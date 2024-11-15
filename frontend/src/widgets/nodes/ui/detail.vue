<template>
  <div>
    <div v-if="node">Node ID: {{ node.id }}</div>
    <div v-else>No node selected</div>
  </div>
</template>

<script>
export default {
  name: "NodeDetail",
  props: {
    node: {
      type: Object,
      default: null,
    },
  },
};
</script>

<style scoped></style>
