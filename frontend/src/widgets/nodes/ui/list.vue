<template>
  <div class="graphbox">
    <Graph :elements="graphData" @node-click="selectNode" />
  </div>
</template>

<script>
import { ref } from "vue";
import { useNodeInfoStore } from "../../../entities/node-info/model/node-store";
import Graph from "./Graph.vue";

export default {
  name: "LogsList",
  components: {
    Graph,
  },
  setup() {
    const store = useNodeInfoStore();

    // Предполагается, что store.nodes уже является реактивным (ref или reactive)
    const graphData = ref(store.graphData);
    return {
      graphData,
    };
  },
  methods: {
    selectNode(node) {
      const store = useNodeInfoStore();
      this.$emit("node-click", store.nodes.get(node.id));
    },
  },
};
</script>

<style scoped>
.graphbox {
  width: 100%;
  height: 100%;
}
</style>
