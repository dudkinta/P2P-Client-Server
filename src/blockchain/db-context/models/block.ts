import crypto from "crypto";
import { Transaction } from "./transaction.js";
import { SmartContract } from "./smart-contract.js";
import { ContractTransaction } from "./contract-transaction.js";
import { selectDelegates } from "./../../../delegator/delegator.js";

export class Block {
  public hash: string;
  public merkleRoot: string;
  public previousHash: string;
  public index: number;
  public timestamp: number;
  public reward: Transaction;
  public transactions: Transaction[];
  public smartContracts: SmartContract[];
  public contractTransactions: ContractTransaction[];
  public neighbors: string[] = [];
  public selectedDelegates: string[] = [];

  constructor(
    index: number,
    previousHash: string,
    timestamp: number,
    reward: Transaction,
    transactions: Transaction[] = [],
    smartContracts: SmartContract[] = [],
    contractTransactions: ContractTransaction[] = [],
    neighbors: string[] = [],
    selectedDelegates: string[] = []
  ) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.reward = reward;
    this.transactions = transactions;
    this.smartContracts = smartContracts;
    this.contractTransactions = contractTransactions;
    this.neighbors = neighbors;
    this.selectedDelegates = selectedDelegates;
    this.merkleRoot = this.calculateMerkleRoot();
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
  }

  calculateHash(): string {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
          this.merkleRoot +
          this.previousHash +
          this.timestamp +
          JSON.stringify(this.transactions) +
          JSON.stringify(this.smartContracts) +
          JSON.stringify(this.contractTransactions) +
          JSON.stringify(this.neighbors) +
          JSON.stringify(this.selectedDelegates)
      )
      .digest("hex");
  }

  isValid(): boolean {
    const checkDelegates = selectDelegates(
      this.previousHash,
      this.timestamp,
      this.neighbors
    );
    return (
      JSON.stringify(checkDelegates) ===
        JSON.stringify(this.selectedDelegates) &&
      this.hash === this.calculateHash()
    );
  }

  addTransaction(tx: Transaction): void {
    this.transactions.push(tx);
  }

  addSmartContract(contract: SmartContract): void {
    this.smartContracts.push(contract);
  }

  addContractTransaction(contractTx: ContractTransaction): void {
    this.contractTransactions.push(contractTx);
  }

  toString(): string {
    return `
      Block #${this.index}
      Timestamp: ${this.timestamp}
      Previous Hash: ${this.previousHash}
      Hash: ${this.hash}
      MerkleRoot: ${this.merkleRoot}
      Transactions: ${JSON.stringify(this.transactions, null, 2)}
      SmartContract: ${JSON.stringify(this.smartContracts, null, 2)}
      ContractTransaction: ${JSON.stringify(this.contractTransactions, null, 2)}
      Delegates: ${JSON.stringify(this.selectedDelegates, null, 2)}
    `;
  }

  calculateMerkleRoot(): string {
    if (this.transactions.length === 0) {
      // Если нет транзакций, возвращаем фиксированный пустой хэш
      return crypto.createHash("sha256").update("").digest("hex");
    }

    if (this.transactions.length === 1) {
      // Если только одна транзакция, возвращаем её хэш
      return this.transactions[0].hash;
    }

    const transactionHashes = this.transactions.map((tx) => tx.hash);

    return this.buildMerkleTreeIterative(transactionHashes);
  }

  private buildMerkleTreeIterative(hashes: string[]): string {
    while (hashes.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = i + 1 < hashes.length ? hashes[i + 1] : left;
        const combinedHash = crypto
          .createHash("sha256")
          .update(left + right)
          .digest("hex");
        nextLevel.push(combinedHash);
      }

      hashes = nextLevel;
    }

    return hashes[0];
  }
}
