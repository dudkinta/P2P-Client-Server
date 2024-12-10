import { defineStore } from 'pinia';
export const useBlockchainStore = defineStore('blockchain', {
    state: () => ({
        blocks: [],
        delegates: [],
    }),
    actions: {
        addBlock(block) {
            if (!this.blocks.find((b) => b.index === block.index)) {
                this.blocks.push(block);
            }
        },
        addDelegate(delegate) {
            if (!this.delegates.find((d) => d.publicKey === delegate.publicKey)) {
                this.delegates.push(delegate);
            }
        },
        replaceDelegates(delegates) {
            this.delegates = delegates;
        }
    },
});