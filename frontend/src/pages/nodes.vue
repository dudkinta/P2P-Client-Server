<template>
  <div class="debug-info">
    <NodeList class="node-list" @node-click="selectNode" />
    <NodeDetail class="node-detail" :node="selectedNode" />
  </div>
</template>

<script>
import NodeList from "./../widgets/nodes/ui/list.vue";
import NodeDetail from "./../widgets/nodes/ui/detail.vue";

export default {
  name: "DebugInfo",
  components: {
    NodeList,
    NodeDetail,
  },
  data() {
    return {
      selectedNode: null,
    };
  },
  methods: {
    selectNode(node) {
      this.selectedNode = node;
    },
  },
};
</script>

<style scoped>
.debug-info {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.node-list {
  flex: 0 0 70%;
  overflow-y: auto;
}

.node-detail {
  flex: 1;
  overflow-y: auto;
  background-color: beige;
}
</style>
