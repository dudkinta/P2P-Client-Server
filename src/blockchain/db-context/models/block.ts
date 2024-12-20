import crypto from "crypto";
import { Transaction, Status } from "./transaction.js";
import { SmartContract } from "./smart-contract.js";
import { ContractTransaction } from "./contract-transaction.js";
import { AllowedTypes } from "./common.js";

export class Block {
  public hash: string;
  public index: number;
  public parentHash: string;
  public timestamp: number;
  public reward: Transaction;
  public transactions: Transaction[];
  public smartContracts: SmartContract[];
  public contractTransactions: ContractTransaction[];
  public validators: string[] = [];

  public parent: Block | undefined;
  public children: Block[] = [];
  public weight: number;
  public cummulativaWeight: number;
  private inWallet: Map<string, number> = new Map();
  private inStake: Map<string, number> = new Map();

  constructor(
    index: number,
    parentHash: string,
    timestamp: number,
    reward: Transaction,
    transactions: Transaction[] = [],
    smartContracts: SmartContract[] = [],
    contractTransactions: ContractTransaction[] = [],
  ) {
    this.index = index;
    this.parentHash = parentHash;
    this.timestamp = timestamp;
    this.reward = reward;
    this.transactions = transactions;
    this.smartContracts = smartContracts;
    this.contractTransactions = contractTransactions;
    this.hash = this.calculateHash();
    this.reward.block = this.hash;
    for (const tx of this.transactions) {
      tx.block = this.hash;
    }
    for (const contract of this.smartContracts) {
      contract.block = this.hash;
    }
    for (const contractTx of this.contractTransactions) {
      contractTx.block = this.hash;
    }
    this.inWallet.set(this.reward.sender, this.reward.amount);
    this.transactions.forEach(tx => {
      this.calcBalances(tx);
    });
    this.weight = this.updateWeight();
    this.cummulativaWeight = (this.parent?.weight ?? 0) + this.weight;
  }

  public calculateHash(): string {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
        (this.parent?.hash ?? "") +
        this.timestamp +
        JSON.stringify(this.reward) +
        JSON.stringify(this.transactions) +
        JSON.stringify(this.smartContracts) +
        JSON.stringify(this.contractTransactions)
      )
      .digest("hex");
  }

  public isValid(): boolean {
    if (this.hash !== this.calculateHash()) {
      return false;
    }
    if (!this.parentHash && this.index != 0) {
      return false;
    }
    if (!this.reward.isValid()) {
      return false;
    }
    for (const tx of this.transactions) {
      if (!tx.isValid()) {
        return false;
      }
    }
    for (const contract of this.smartContracts) {
      if (!contract.isValid()) {
        return false;
      }
    }
    for (const contractTx of this.contractTransactions) {
      if (!contractTx.isValid()) {
        return false;
      }
    }
    return true;
  }

  public addTransaction(tx: Transaction): void {
    this.transactions.push(tx);
  }

  public addSmartContract(contract: SmartContract): void {
    this.smartContracts.push(contract);
  }

  public addContractTransaction(contractTx: ContractTransaction): void {
    this.contractTransactions.push(contractTx);
  }

  public toString(): string {
    return `
      Block #${this.index}
      Timestamp: ${this.timestamp}
      Previous Hash: ${this.parent?.hash}
      Hash: ${this.hash}
      Transactions: ${JSON.stringify(this.transactions, null, 2)}
      SmartContract: ${JSON.stringify(this.smartContracts, null, 2)}
      ContractTransaction: ${JSON.stringify(this.contractTransactions, null, 2)}
      Validators: ${JSON.stringify(this.validators, null, 2)}
    `;
  }

  public setParentBlock(parent: Block) {
    this.parent = parent;
    if (!parent.children.find((b) => b.hash == this.hash)) {
      parent.children.push(this);
    }
  }

  public updateWeight(): number {
    let currentblock: Block | undefined = this;
    let res = 0;
    while (currentblock) {
      const cb = currentblock;
      currentblock.validators.forEach((v) => {
        res += cb.getBalanceStake(v);
      });
      currentblock = currentblock.parent;
    }
    return res;
  }

  public getBalanceWallet(owner: string): number {
    return this.inWallet.get(owner) ?? 0;
  }

  public getBalanceStake(owner: string): number {
    return this.inStake.get(owner) ?? 0;
  }

  private calcBalances(tx: Transaction) {
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
      let senderAmount: number = 0;
      let cBlock: Block | undefined = this;
      while (cBlock) {
        senderAmount = cBlock.inWallet.get(tx.sender) ?? 0;
        cBlock = cBlock.parent;
      }
      return (senderAmount >= tx.amount);
    }
    if (tx.receiver && tx.type == AllowedTypes.REWARD) {
      return true;
    }
    if (tx.sender && tx.amount > 0 && tx.type == AllowedTypes.STAKE) {
      let senderAmount: number = 0;
      let cBlock: Block | undefined = this;
      while (cBlock) {
        senderAmount = cBlock.inWallet.get(tx.sender) ?? 0;
        cBlock = cBlock.parent;
      }
      return (senderAmount >= tx.amount);
    }
    if (tx.sender && tx.amount > 0 && tx.type == AllowedTypes.UNSTAKE) {
      let inStakeAmount: number = 0;
      let cBlock: Block | undefined = this;
      while (cBlock) {
        inStakeAmount = cBlock.inStake.get(tx.sender) ?? 0;
        cBlock = cBlock.parent;
      }
      return (inStakeAmount >= tx.amount);
    }
    tx.status = Status.REJECT;
    return false;
  }
}
