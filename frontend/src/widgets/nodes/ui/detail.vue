<template>
  <div>
    <div v-if="node">
      <pre>{{ formattedNode }}</pre>
    </div>
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
  computed: {
    formattedNode() {
      return JSON.stringify(this.node, null, 2);
    },
  },
};
</script>

<style scoped></style>
