<template>
  <div class="filter-container">
    <div class="filter-services">
      <h3>Сервисы</h3>
      <ul>
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
      <ul>
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
import { useLogStore } from "./../../../entities/logs/model/log-store";
export default {
  name: "Filter",
  data() {
    return {
      services: useLogStore().services,
      levels: useLogStore().levels,
    };
  },
  methods: {
    toggleService(service, isChecked) {
      console.log(service, isChecked);
      this.services.set(service, isChecked);
      console.log(this.services);
    },
    toggleLevel(level, isChecked) {
      console.log(level, isChecked);
      this.levels.set(level, isChecked);
      console.log(this.levels);
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
</style>
