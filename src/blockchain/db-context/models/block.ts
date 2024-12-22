import crypto from "crypto";
import { Transaction } from "./transaction.js";
import { BlockValidate } from "../../../network/services/messages/index.js";
import { BlockDiff, UTXOPool } from "./utxp-pool.js";

export class Block {
  public hash: string; // Хэш текущего блока
  public index: number; // Индекс блока
  public parentHash: string; // Хэш родительского блока
  public timestamp: number; // Время создания блока
  public transactions: Transaction[]; // Транзакции в блоке
  public parent?: Block; // Ссылка на родительский блок
  public children: Block[] = [];
  public validators: BlockValidate[] = [];
  public cummulativeWeight: number = 0;
  public weight: number = 0;
  private diff?: BlockDiff;
  constructor(
    index: number,
    parentHash: string,
    timestamp: number,
    transactions: Transaction[] = []
  ) {
    this.index = index;
    this.parentHash = parentHash;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.hash = this.calculateHash();
  }

  // Расчёт хэша блока
  public calculateHash(): string {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
        this.parentHash +
        this.timestamp +
        JSON.stringify(this.transactions)
      )
      .digest("hex");
  }

  // Проверка валидности блока
  public isValid(): boolean {
    // Проверка корректности хэша
    if (this.hash !== this.calculateHash()) {
      console.error("Block hash mismatch.");
      return false;
    }

    // Проверка транзакций
    for (const tx of this.transactions) {
      if (!tx.isValid()) {
        console.error("Invalid transaction detected.");
        return false;
      }
    }
    return true;
  }

  public setParent(parent: Block, utxoPool: UTXOPool) {
    this.parent = parent;
    if (this.parent.children.find((b) => b.hash === this.hash)) {
      return; // Блок уже добавлен
    }
    this.parent.children.push(this);
    this.weight = this.calculateWeight(utxoPool)
    this.cummulativeWeight = this.parent.cummulativeWeight + this.weight;
  }

  // Печать блока
  public toString(): string {
    return `
      Block #${this.index}
      Timestamp: ${this.timestamp}
      Previous Hash: ${this.parentHash}
      Hash: ${this.hash}
      Transactions: ${JSON.stringify(this.transactions, null, 2)}
    `;
  }

  private calculateWeight(utxoPool: UTXOPool): number {
    if (!this.diff) {
      throw new Error("Diff not generated for this block.");
    }

    // Сохраняем текущее состояние UTXOPool
    const originalBlockHash = utxoPool.currentBlockHash;

    try {
      // Применяем диффы, если UTXOPool не синхронизирован с текущим блоком
      if (originalBlockHash !== this.parentHash) {
        this.syncUTXOPoolToBlock(utxoPool);
      }

      let weight = 0;

      // Учитываем сумму всех outputs (добавленные UTXO)
      this.diff.addedUTXOs.forEach((output) => {
        const activity = utxoPool.getActivity(output.address);
        weight += output.amount + activity * 0.1;
      });

      // Учитываем удаленные UTXO (inputs)
      this.diff.removedUTXOs.forEach((utxo) => {
        const activity = utxoPool.getActivity(utxo.address);
        weight += activity * 0.1;
      });

      // Учитываем количество inputs и outputs
      weight += this.diff.removedUTXOs.size * 0.5;
      weight += this.diff.addedUTXOs.size * 0.2;

      // Фиксированный вес за транзакцию
      weight += this.transactions.length * 1;

      // Учитываем вес от валидаторов
      weight += this.validators.length * 2;
      this.validators.forEach((v) => {
        const activity = utxoPool.getActivity(v.publicKey);
        weight += activity;
      });

      return weight;
    } finally {
      // Откат UTXOPool в исходное состояние
      if (originalBlockHash !== utxoPool.currentBlockHash) {
        this.revertUTXOPoolToOriginalState(utxoPool, originalBlockHash);
      }
    }
  }

  public addValidators(validators: BlockValidate[], utxoPool: UTXOPool): void {
    validators.forEach((validator) => {
      if (!this.validators.find((v) => v.publicKey === validator.publicKey)) {
        this.validators.push(validator);
      }
    });
    this.updateWeight(utxoPool);
  }

  public addValidator(validator: BlockValidate, utxoPool: UTXOPool): void {
    if (!this.validators.find((v) => v.publicKey === validator.publicKey)) {
      this.validators.push(validator);
      this.updateWeight(utxoPool);
    }
  }

  private updateWeight(uthoPool: UTXOPool): void {
    this.weight = this.calculateWeight(uthoPool);
    this.cummulativeWeight = (this.parent?.cummulativeWeight ?? 0) + this.weight;
  }

  public generateDiff(utxoPool: UTXOPool): BlockDiff {
    if (utxoPool.currentBlockHash !== this.parentHash) {
      throw new Error("UTXOPool is not synchronized with this block's parent.");
    }

    const diff = new BlockDiff();

    for (const tx of this.transactions) {
      // Удаляем UTXO, которые были использованы в input'ах
      for (const input of tx.inputs) {
        const key = `${input.txId}:${input.outputIndex}`;
        const utxo = utxoPool.getUTXO(input.txId, input.outputIndex);
        if (utxo) {
          diff.removedUTXOs.set(key, utxo);
        } else {
          throw new Error(`UTXO ${key} not found. Block may be invalid.`);
        }
      }

      // Добавляем UTXO, которые были созданы в output'ах
      tx.outputs.forEach((output, index) => {
        const key = `${tx.hash}:${index}`;
        diff.addedUTXOs.set(key, output);
      });
    }

    this.diff = diff;
    return diff;
  }

  public getDiff(): BlockDiff {
    if (!this.diff) {
      throw new Error("Diff not generated for this block.");
    }
    return this.diff;
  }

  private syncUTXOPoolToBlock(utxoPool: UTXOPool): void {
    let currentBlock: Block | undefined = this;

    const diffs: BlockDiff[] = [];

    // Идем по цепочке до синхронизированного блока
    while (currentBlock && utxoPool.currentBlockHash !== currentBlock.parentHash) {
      if (!currentBlock.diff) {
        throw new Error(`Diff not generated for block ${currentBlock.hash}`);
      }
      diffs.push(currentBlock.diff);
      currentBlock = currentBlock.parent;
    }

    // Применяем все диффы в обратном порядке
    for (let i = diffs.length - 1; i >= 0; i--) {
      utxoPool.applyDiff(diffs[i]);
    }
  }
  private revertUTXOPoolToOriginalState(
    utxoPool: UTXOPool,
    originalBlockHash: string | null
  ): void {
    let currentBlock: Block | undefined = this;

    const diffs: BlockDiff[] = [];

    // Идем по цепочке до синхронизированного блока
    while (currentBlock && utxoPool.currentBlockHash !== originalBlockHash) {
      if (!currentBlock.diff) {
        throw new Error(`Diff not generated for block ${currentBlock.hash}`);
      }
      diffs.push(currentBlock.diff);
      currentBlock = currentBlock.parent;
    }

    // Откатываем все диффы
    for (const diff of diffs) {
      utxoPool.revertDiff(diff);
    }
  }
}