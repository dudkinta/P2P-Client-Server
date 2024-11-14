<template>
  <div class="logs-list">
    <ul class="no-bullets">
      <li
        v-for="log in filteredLogs"
        :key="log"
        class="log-item"
        :class="log.level.toUpperCase()"
      >
        <div class="log-content">
          <div class="log-info">
            <div class="log-timestamp">
              {{ formattedTimestamp(log.timestamp) }}
            </div>
            <div class="log-level">{{ log.level }}</div>
            <div
              class="log-service"
              :style="{ color: getServiceColor(log.service) }"
            >
              <span class="badge">{{ log.service }}</span>
            </div>
          </div>
          <div class="log-message">{{ log.message }}</div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
import { useDebugInfoStore } from "../../../entities/debug-info/model/debug-store";
import { format } from "date-fns";
export default {
  name: "LogsList",
  data() {
    return {
      services: useDebugInfoStore().services,
      levels: useDebugInfoStore().levels,
      logs: useDebugInfoStore().logs,
      serviceColors: new Map(),
    };
  },
  computed: {
    formattedTimestamp() {
      return (timestamp) => format(new Date(timestamp), "HH:mm:ss.SSS");
    },
    filteredLogs() {
      const anyServiceSelected = Array.from(this.services.values()).some(
        (value) => value
      );
      const anyLevelSelected = Array.from(this.levels.values()).some(
        (value) => value
      );

      if (!anyServiceSelected || !anyLevelSelected) {
        return [];
      }

      return this.logs
        .filter((log) => {
          const serviceMatch =
            !anyServiceSelected || this.services.get(log.service);
          const levelMatch = !anyLevelSelected || this.levels.get(log.level);

          return serviceMatch && levelMatch;
        })
        .reverse();
    },
  },
  methods: {
    getServiceColor(service) {
      if (!this.serviceColors.has(service)) {
        const color = this.generateColor();
        this.serviceColors.set(service, color);
      }
      return this.serviceColors.get(service);
    },
    generateColor() {
      const hue = Math.floor(Math.random() * 360); // Генерируем случайный оттенок
      const saturation = Math.floor(Math.random() * 10) + 901; // Насытить от 60% до 100%
      const lightness = Math.floor(Math.random() * 10) + 25; // Яркость от 40% до 60%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    },
  },
};
</script>

<style scoped>
.logs-list {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
.log-item {
  padding: 5px 0;
  border-bottom: 1px solid #ddd;
}
.log-content {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 10px;
  width: 100%;
}
.log-info {
  display: flex;
  gap: 10px;
  width: 320px; /* Установлена фиксированная ширина для выравнивания */
}
.log-level,
.log-timestamp {
  flex: 1;
  white-space: nowrap;
}
.log-message {
  word-break: break-word;
  flex: 1;
}
.no-bullets {
  list-style-type: none;
  padding: 0;
}
.log-item.CRITICAL {
  background-color: #ff4d4d;
  color: #ffffff;
}
.log-item.ERROR {
  background-color: #ff9999;
  color: #000000;
}
.log-item.WARNING {
  background-color: #ffcc00;
  color: #000000;
}
.log-item.INFO {
  background-color: #cce5ff;
  color: #000000;
}
.log-item.DEBUG {
  background-color: #e6e6e6;
  color: #000000;
}
.log-item.TRACE {
  background-color: #f9f9f9;
  color: #000000;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  font-weight: bold;
  text-align: center;
  white-space: nowrap;
}
</style>
