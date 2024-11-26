import { Block } from "./models/block.js";

export class BlockChain {
  private static instance: BlockChain;
  private constructor() {}
  public static getInstance(): BlockChain {
    if (!BlockChain.instance) {
      BlockChain.instance = new BlockChain();
    }
    return BlockChain.instance;
  }

  public async init(): Promise<void> {}

  private chain: Block[] = [];
  public getChain(): Block[] {
    return this.chain;
  }

  public addBlock(block: Block): void {
    this.chain.push(block);
  }

  public getLastBlock(): Block {
    return this.chain[this.chain.length - 1];
  }

  public isValidBlockStructure(block: Block): boolean {
    return block.isValid();
  }
}
