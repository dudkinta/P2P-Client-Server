import { defineStore } from 'pinia';
export const useBlockchainStore = defineStore('blockchain', {
    state: () => ({
        blocks: [],
    }),
    actions: {
        addBlock(block) {
            if (this.blocks.find((b) => b.index === block.index)) {
                return;
            }
            this.blocks.push(block);
        },
    },
});