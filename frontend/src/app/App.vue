<template>
  <div id="app">
    <Menu />
    <router-view />
  </div>
</template>

<script setup>
import Menu from "./../widgets/menu/ui/menu.vue";
import { initializeSocket } from "./../shared/socket";

const socket = initializeSocket();
</script>
