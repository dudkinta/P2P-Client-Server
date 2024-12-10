<template>
  <div class="block-list">
    Список блоков:
    <ul class="no-bullets">
      <li v-for="block in blocks" :key="block.index" class="block-item">
        <div class="block-content">
          <div class="block-info">
            <div class="block-timestamp">
              {{ formattedTimestamp(block.timestamp) }}
            </div>
            <div class="block-index">{{ block.index }}</div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
<script>
import { useBlockchainStore } from "../../../entities/blockchain/model/blockchain-store";
import blockchainApi from "./../api/blockchain-api";
import { format } from "date-fns";
export default {
  name: "BlockList",
  data() {
    return {
      blocks: useBlockchainStore().blocks,
      blockchainApi: new blockchainApi(),
    };
  },
  computed: {
    formattedTimestamp() {
      return (timestamp) => format(new Date(timestamp), "HH:mm:ss.SSS");
    },
  },
  created() {
    this.getChain();
  },
  methods: {
    async getChain() {
      try {
        const response = await this.blockchainApi.getChain();
        if (!response.chain) {
          return;
        }
        response.chain.map((block) => {
          useBlockchainStore().setBlock(block);
        });
        this.blocks = useBlockchainStore().blocks;
      } catch (error) {
        console.error(
          "Ошибка получения цепочки блоков:",
          error.message || error
        );
      }
    },
  },
};
</script>
