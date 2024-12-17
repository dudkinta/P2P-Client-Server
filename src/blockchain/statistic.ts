import { injectable } from "inversify";
import { Status, Transaction } from "./db-context/models/transaction.js";
import { AllowedTypes } from "./db-context/models/common.js";
import { Block } from "./db-context/models/block.js";

const genesisKey = '03b731838799d7c4a221a915752afe8959e64e4b25efd2c76774220984d8f188f3';
const genesisStartActive = 1000000;

@injectable()
export class Statistic {
    private inWallet: Map<string, number> = new Map();
    private inStake: Map<string, number> = new Map();
    private actives: Map<string, number> = new Map();
    private lastActives: Map<string, number> = new Map();

    constructor() {
        this.actives.set(genesisKey, genesisStartActive);
    }
    public getBalanceWallet(owner: string) {
        return this.inWallet.get(owner) ?? 0;
    }

    public getBalanceStake(owner: string) {
        return this.inStake.get(owner) ?? 0;
    }

    public getActives(owner: string) {
        return (this.actives.get(owner) ?? 0) + Math.round((this.lastActives.get(owner) ?? 0) / 1000 / 60);
    }

    public getTopActives(top?: number) {
        const timePenalty = Math.round(Date.now() / 1000 / 60);
        const activesArray = Array.from(this.actives);
        const sorted = activesArray.sort((a, b) => (this.getActives(a[0]) - timePenalty) - (this.getActives(b[0]) - timePenalty));
        return top ? sorted.slice(0, top) : sorted;
    }

    public calcBalances(tx: Transaction) {
        if (tx.receiver && tx.sender && tx.amount > 0 && tx.type == AllowedTypes.TRANSFER) {
            const senderAmount = this.inWallet.get(tx.sender) ?? 0;
            const receiverAmount = this.inWallet.get(tx.receiver) ?? 0;
            if (senderAmount >= tx.amount) {
                this.inWallet.set(tx.sender, senderAmount - tx.amount);
                this.inWallet.set(tx.receiver, receiverAmount + tx.amount);
            }
        }
        if (tx.receiver && tx.amount > 0 && tx.type == AllowedTypes.REWARD) {
            const receiverAmount = this.inWallet.get(tx.receiver) ?? 0;
            this.inWallet.set(tx.receiver, receiverAmount + tx.amount);
        }
        if (tx.sender && tx.amount > 0 && tx.type == AllowedTypes.STAKE) {
            const senderAmount = this.inWallet.get(tx.sender) ?? 0;
            if (senderAmount >= tx.amount) {
                const inStakeAmount = this.inStake.get(tx.sender) ?? 0;
                this.inWallet.set(tx.sender, senderAmount - tx.amount);
                this.inStake.set(tx.sender, inStakeAmount + tx.amount);
            }
        }
        if (tx.sender && tx.amount > 0 && tx.type == AllowedTypes.UNSTAKE) {
            const inStakeAmount = this.inStake.get(tx.sender) ?? 0;
            if (inStakeAmount >= tx.amount) {
                const senderAmount = this.inWallet.get(tx.sender) ?? 0;
                this.inStake.set(tx.sender, inStakeAmount - tx.amount);
                this.inWallet.set(tx.sender, senderAmount + tx.amount);
            }
        }
    }

    public checkBalance(tx: Transaction): boolean {
        if (tx.receiver && tx.sender && tx.amount > 0 && tx.type == AllowedTypes.TRANSFER) {
            const senderAmount = this.inWallet.get(tx.sender) ?? 0;
            return (senderAmount >= tx.amount);
        }
        if (tx.receiver && tx.type == AllowedTypes.REWARD) {
            return true;
        }
        if (tx.sender && tx.amount > 0 && tx.type == AllowedTypes.STAKE) {
            const senderAmount = this.inWallet.get(tx.sender) ?? 0;
            return (senderAmount >= tx.amount);
        }
        if (tx.sender && tx.amount > 0 && tx.type == AllowedTypes.UNSTAKE) {
            const inStakeAmount = this.inStake.get(tx.sender) ?? 0;
            return (inStakeAmount >= tx.amount);
        }
        tx.status = Status.REJECT;
        return false;
    }

    public calcActive(block: Block) {
        if (block.reward.receiver) {
            const receiverRewardScore = this.actives.get(block.reward.sender) ?? 0;
            this.actives.set(block.reward.receiver, receiverRewardScore + 1);
            const lastActives = this.lastActives.get(block.reward.receiver) ?? 0;
            if (lastActives < block.timestamp) {
                this.lastActives.set(block.reward.receiver, lastActives);
            }
        }
        if (block.transactions.length > 0) {
            block.transactions.forEach((tx) => {
                const senderScore = this.actives.get(tx.sender) ?? 0;
                const value = tx.type == AllowedTypes.TRANSFER ? 1 :
                    tx.type == AllowedTypes.STAKE ? 0.1 * tx.amount :
                        tx.type == AllowedTypes.UNSTAKE ? -0.1 * tx.amount : 0;
                this.actives.set(tx.sender, senderScore + value);
                const lastActives = this.lastActives.get(tx.sender) ?? 0;
                if (lastActives < block.timestamp) {
                    this.lastActives.set(tx.sender, lastActives);
                }
            });
        }
        if (block.smartContracts.length > 0) {
            block.smartContracts.forEach((sc) => {
                const senderScore = this.actives.get(sc.owner) ?? 0;
                this.actives.set(sc.owner, senderScore + 1);
                const lastActives = this.lastActives.get(sc.owner) ?? 0;
                if (lastActives < block.timestamp) {
                    this.lastActives.set(sc.owner, lastActives);
                }
            });
        }
        if (block.contractTransactions.length > 0) {
            block.contractTransactions.forEach((tx) => {
                const senderScore = this.actives.get(tx.sender) ?? 0;
                this.actives.set(tx.sender, senderScore + 1);
                const lastActives = this.lastActives.get(tx.sender) ?? 0;
                if (lastActives < block.timestamp) {
                    this.lastActives.set(tx.sender, lastActives);
                }
            });
        }
        if (block.validators.length > 0) {
            block.validators.forEach((v) => {
                const activeScore = this.actives.get(v) ?? 0;
                this.actives.set(v, activeScore + 1);
                const lastActives = this.lastActives.get(v) ?? 0;
                if (lastActives < block.timestamp) {
                    this.lastActives.set(v, lastActives);
                }
            });
        }
    }
}