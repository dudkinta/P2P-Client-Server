import { injectable } from "inversify";
import { Status, Transaction } from "./db-context/models/transaction.js";
import { AllowedTypes } from "./db-context/models/common.js";
import { Block } from "./db-context/models/block.js";

@injectable()
export class Statistic {
    private inWallet: Map<string, number> = new Map();
    private inStake: Map<string, number> = new Map();
    private actives: Map<string, number> = new Map();

    public getBalanceWallet(owner: string) {
        return this.inWallet.get(owner) ?? 0;
    }

    public getBalanceStake(owner: string) {
        return this.inStake.get(owner) ?? 0;
    }

    public getActives(owner: string) {
        return this.actives.get(owner) ?? 0;
    }

    public getTopActives(top?: number) {
        const activesArray = Array.from(this.actives);
        const sorted = activesArray.sort((a, b) => a[1] - b[1]);
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
        }
        if (block.transactions.length > 0) {
            block.transactions.forEach((tx) => {
                const senderScore = this.actives.get(tx.sender) ?? 0;
                const value = tx.type == AllowedTypes.TRANSFER ? 1 :
                    tx.type == AllowedTypes.STAKE ? 0.1 * tx.amount :
                        tx.type == AllowedTypes.UNSTAKE ? -0.1 * tx.amount : 0;
                this.actives.set(tx.sender, senderScore + value);
            });
        }
        if (block.smartContracts.length > 0) {
            block.smartContracts.forEach((sc) => {
                const senderScore = this.actives.get(sc.owner) ?? 0;
                this.actives.set(sc.owner, senderScore + 1);
            });
        }
        if (block.contractTransactions.length > 0) {
            block.contractTransactions.forEach((tx) => {
                const senderScore = this.actives.get(tx.sender) ?? 0;
                this.actives.set(tx.sender, senderScore + 1);
            });
        }
    }
}