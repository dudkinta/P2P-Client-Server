<template>
  <div ref="cyContainer" :style="{ width: '100%', height: '100%' }"></div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import cytoscape from "cytoscape";
//import cola from "cytoscape-cola"; // Импорт расширения Cola
//cytoscape.use(cola);

export default {
  name: "Graph",
  props: {
    elements: {
      type: Array,
      required: true,
    },
    layout: {
      type: Object,
      default: () => ({
        name: "cose",
      }),
    },
  },
  setup(props) {
    const cyContainer = ref(null);
    let cyInstance = null;

    const initializeCytoscape = () => {
      cyInstance = cytoscape({
        container: cyContainer.value,
        elements: props.elements,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#666",
              "background-fit": "contain",
              content: "data(label)",
              "font-size": "5px",
              "text-valign": "center",
              "text-halign": "center",
              "background-color": "#555",
              "text-outline-color": "#555",
              "text-outline-width": "1px",
              color: "#fff",
            },
          },
          {
            selector: "node[?root]",
            style: {
              "background-clip": "none",
              "background-fit": "contain",
              "background-color": "#77828C",
            },
          },
          {
            selector: "node:selected",
            style: {
              "border-width": "6px",
              "border-color": "#AAD8FF",
              "border-opacity": "0.5",
              "background-color": "#77828C",
              "text-outline-color": "#77828C",
            },
          },
          {
            selector: "edge",
            style: {
              "curve-style": "bezier",
              opacity: "0.4",
              "line-color": "#bbb",
              "overlay-padding": "3px",
              width: "0.5px",
            },
          },
        ],
        layout: props.layout,
      });

      // Пример добавления слушателя событий
      cyInstance.on("tap", "node", (evt) => {
        const node = evt.target;
        console.log("Нажат узел", node.id());
        // Дополнительные действия при нажатии на узел
      });
    };

    onMounted(() => {
      initializeCytoscape();
    });

    onBeforeUnmount(() => {
      if (cyInstance) {
        cyInstance.destroy();
      }
    });

    // Обновление элементов при изменении пропса
    watch(
      () => props.elements,
      (newElements) => {
        if (cyInstance) {
          cyInstance.json({ elements: newElements });
          cyInstance.layout(props.layout).run();
        }
      },
      { deep: true }
    );

    // Обновление раскладки при изменении пропса layout
    watch(
      () => props.layout,
      (newLayout) => {
        if (cyInstance) {
          cyInstance.layout(newLayout).run();
        }
      },
      { deep: true }
    );

    return {
      cyContainer,
    };
  },
};
</script>

<style scoped>
/* Дополнительные стили при необходимости */
</style>
