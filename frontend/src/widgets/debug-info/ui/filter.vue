<template>
  <div class="filter-container">
    <div class="filter-services">
      <h3>Сервисы</h3>
      <ul class="no-bullets">
        <li v-for="service in services" :key="service[0]">
          <label>
            <input
              type="checkbox"
              :checked="service[1]"
              @change="toggleService(service[0], $event.target.checked)"
            />
            {{ service[0] }}
          </label>
        </li>
      </ul>
    </div>
    <div class="filter-levels">
      <h3>Уровни</h3>
      <ul class="no-bullets">
        <li v-for="level in levels" :key="level[0]">
          <label>
            <input
              type="checkbox"
              :checked="level[1]"
              @change="toggleLevel(level[0], $event.target.checked)"
            />
            {{ level[0] }}
          </label>
        </li>
      </ul>
    </div>
  </div>
</template>
<script>
import { useDebugInfoStore } from "../../../entities/debug-info/model/debug-store";
export default {
  name: "Filter",
  data() {
    return {
      services: useDebugInfoStore().services,
      levels: useDebugInfoStore().levels,
    };
  },
  methods: {
    toggleService(service, isChecked) {
      this.services.set(service, isChecked);
    },
    toggleLevel(level, isChecked) {
      this.levels.set(level, isChecked);
    },
  },
};
</script>
<style scoped>
.filter-container {
  display: flex;
  align-items: flex-start;
}
.filter-services,
.filter-levels {
  margin-right: 20px;
}
.filtered-logs {
  margin-top: 20px;
}
.no-bullets {
  list-style-type: none;
  padding: 0;
}
</style>
