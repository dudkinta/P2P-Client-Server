<template>
  <nav class="menu">
    <div class="menu-left">
      <router-link to="/wallet" class="menu-item">Кошелек</router-link>
      <router-link to="/blockchain" class="menu-item">Блокчейн</router-link>
      <router-link to="/nodes" class="menu-item">Узлы</router-link>
    </div>
    <div class="menu-right">
      <router-link to="/debug-info" class="menu-item">Логи</router-link>
    </div>
  </nav>
</template>

<script setup></script>

<style scoped>
.menu {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #f5f5f5;
}

.menu-left {
  display: flex;
  gap: 20px;
}

.menu-right {
  margin-left: auto;
}

.menu-item {
  text-decoration: none;
  color: #333;
  font-weight: bold;
}

.menu-item:hover {
  color: #007bff;
}
</style>
