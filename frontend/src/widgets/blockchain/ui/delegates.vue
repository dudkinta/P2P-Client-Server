<template>
  <div class="delegat-list">
    Список потенциальных делегатов:
    <ul class="no-bullets">
      <li
        v-for="delegat in delegates"
        :key="delegat.publicKey"
        class="block-item"
      >
        <div class="delegat-content">
          <div class="delegat-info">
            <div class="delegat-key">
              {{ delegat.publicKey }}
            </div>
            <div class="delegat-address">{{ delegat.sender }}</div>
            <div class="delegat-dt">{{ delegat.dt }}</div>
            <div class="delegat-lastValidation">
              {{ delegat.lastValidation }}
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
<script>
import { useBlockchainStore } from "../../../entities/blockchain/model/blockchain-store";
import blockchainApi from "./../api/blockchain-api";
export default {
  name: "DelegatList",
  data() {
    return {
      delegates: useBlockchainStore().delegates,
      blockchainApi: new blockchainApi(),
    };
  },
  created() {
    this.getDelegates();
  },
  methods: {
    async getDelegates() {
      try {
        const response = await this.blockchainApi.getDelegates();
        if (!response.neighbors) {
          return;
        }
        useBlockchainStore().replaceDelegates(response.neighbors);
        this.delegates = useBlockchainStore().delegates;
      } catch (error) {
        console.error(
          "Ошибка получения списка соседей:",
          error.message || error
        );
      }
    },
  },
};
</script>
