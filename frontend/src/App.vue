<template>
  <div>
    <h1>Socket.IO с Vue 3</h1>
    <p>Сообщение от сервера: {{ message }}</p>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
import socket from "./socket";

export default {
  setup() {
    const message = ref("");

    // Получение данных с сервера при подключении
    onMounted(() => {
      socket.on("debug", (data) => {
        message.value = data.message;
      });
    });

    return { message };
  },
};
</script>
