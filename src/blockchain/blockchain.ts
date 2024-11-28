import { BlockStorage } from "./db-context/database.js";
import { Block } from "./db-context/models/block.js";

export class BlockChain {
  private static instance: BlockChain;
  private chain: Block[] = [];
  private constructor() {}
  static getInstance(): BlockChain {
    if (!BlockChain.instance) {
      BlockChain.instance = new BlockChain();
    }
    return BlockChain.instance;
  }

  async init(): Promise<void> {}

  getChain(): Block[] {
    return this.chain;
  }

  addBlock(block: Block): void {
    this.chain.push(block);
  }

  getLastBlock(): Block | undefined {
    return this.chain[this.chain.length - 1];
  }

  /**
   * Ленивая загрузка блока по индексу
   */
  async getBlock(index: number): Promise<Block | undefined> {
    // Проверяем, есть ли блок в памяти
    const block = this.chain.find((b) => b.index === index);
    if (block) return block;

    // Если блока нет в памяти, загружаем его из базы
    return await BlockStorage.get(index);
  }

  /**
   * Ленивая загрузка диапазона блоков
   */
  async getBlocksInRange(start: number, end: number): Promise<Block[]> {
    return await BlockStorage.getByRange(start, end);
  }

  isValidBlock(block: Block): boolean {
    return block.isValid();
  }

  calculateBlockReward(
    totalCoins: number, // Общее количество монет (1 миллиард)
    totalYears: number, // Общее количество лет (50 лет)
    blockInterval: number, // Интервал между блоками в секундах (5 секунд)
    halvings: number, // Количество халвингов (16)
    blockNumber: number // Номер блока, для которого рассчитывается вознаграждение
  ): number {
    // Количество блоков в год
    const blocksPerYear = Math.floor((365 * 24 * 60 * 60) / blockInterval);

    // Общее количество блоков за весь период
    const totalBlocks = blocksPerYear * totalYears;

    // Количество блоков на один этап (до следующего халвинга)
    const blocksPerStage = totalBlocks / halvings;

    // Начальное вознаграждение
    const initialReward =
      totalCoins /
      ((blocksPerStage * (1 - Math.pow(0.5, halvings))) / (1 - 0.5));

    // Определяем текущий этап (номер халвинга)
    const currentStage = Math.floor(blockNumber / blocksPerStage);

    // Вознаграждение за блок в текущем этапе
    const reward = initialReward / Math.pow(2, currentStage);

    return reward;
  }
}
