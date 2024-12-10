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
        },
        updateDelegate(delegate) {
            if (delegate.command == 'add') {
                console.log('add delegate:', delegate);
                this.addDelegate(delegate.delegate);
            }
            if (delegate.command == 'remove') {
                console.log('remove delegate:', delegate);
                this.delegates = this.delegates.filter((d) => d.publicKey !== delegate.publicKey);
            }
        }
    },
});