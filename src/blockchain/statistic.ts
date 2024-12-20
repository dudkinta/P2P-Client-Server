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
    public getBalanceWallet(owner: string): number {
        return this.inWallet.get(owner) ?? 0;
    }

    public getBalanceStake(owner: string): number {
        return this.inStake.get(owner) ?? 0;
    }

    public getActives(owner: string): number {
        return (this.actives.get(owner) ?? 0) + Math.round((this.lastActives.get(owner) ?? 0) / 1000 / 60);
    }

    public getTopActives(top?: number): Map<string, number> {
        const timePenalty = Math.round(Date.now() / 1000 / 60);
        const activesArray = Array.from(this.actives);
        const sorted = activesArray.sort((a, b) => (this.getActives(a[0]) - timePenalty) - (this.getActives(b[0]) - timePenalty));
        return new Map(top ? sorted.slice(0, top) : sorted);
    }

    public getSummActives(owners: string[]): number {
        let res = 0;
        const timePenalty = Math.round(Date.now() / 1000 / 60);
        owners.forEach((owner) => {
            res += (this.getActives(owner) - timePenalty);
        });
        return res;
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

    private readonly weights = {
        reward: 1,
        transaction: 1,
        smartContract: 2,
        contractTransaction: 1.5,
        validator: 0.5,
    } as const;
    private addActivity(account: string, value: number, type: keyof typeof this.weights) {
        const weight = this.weights[type];
        const currentScore = this.actives.get(account) ?? 0;
        this.actives.set(account, currentScore + value * weight);
    }
    private updateLastActive(account: string, timestamp: number) {
        const lastActive = this.lastActives.get(account) ?? 0;
        if (lastActive < timestamp) {
            this.lastActives.set(account, timestamp);
        }
    }
    private getTransactionValue(tx: Transaction): number {
        switch (tx.type) {
            case AllowedTypes.TRANSFER:
                return 1;
            case AllowedTypes.STAKE:
                return 0.1 * tx.amount;
            case AllowedTypes.UNSTAKE:
                return -0.1 * tx.amount;
            default:
                return 0;
        }
    }
    public calcActive(block: Block) {
        if (block.reward.receiver) {
            this.addActivity(block.reward.receiver, 1, "reward");
            this.updateLastActive(block.reward.receiver, block.timestamp);
        }

        block.transactions.forEach((tx) => {
            const value = this.getTransactionValue(tx);
            this.addActivity(tx.sender, value, "transaction");
            this.updateLastActive(tx.sender, block.timestamp);
        });

        block.smartContracts.forEach((sc) => {
            this.addActivity(sc.owner, 1, "smartContract");
            this.updateLastActive(sc.owner, block.timestamp);
        });

        block.contractTransactions.forEach((tx) => {
            this.addActivity(tx.sender, 1, "contractTransaction");
            this.updateLastActive(tx.sender, block.timestamp);
        });

        block.validators.forEach((v) => {
            this.addActivity(v, 1, "validator");
            this.updateLastActive(v, block.timestamp);
        });
    }
}