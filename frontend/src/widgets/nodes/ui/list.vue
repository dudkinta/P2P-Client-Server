<template>
  <div class="graphbox">
    <Graph :elements="graphData" />
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
};
</script>

<style scoped>
.graphbox {
  width: 100%;
  height: 100%;
}
</style>
