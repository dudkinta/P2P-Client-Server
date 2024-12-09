import { defineStore } from 'pinia';
export const useBlockchainStore = defineStore('blockchain', {
    state: () => ({
        blocks: [],
        delegates: [],
    }),
    actions: {
        addBlock(block) {
            if (this.blocks.find((b) => b.index === block.index)) {
                return;
            }
            this.blocks.push(block);
        },
        addDelegate(delegate) {
            if (this.delegates.find((d) => d.publicKey === delegate.publicKey)) {
                return;
            }
            this.delegates.push(delegate);
        },
    },
});