import { injectable, inject } from "inversify";
import { TYPES } from "../../types.js";
import { Router } from "express";
import { BlockChain } from "../blockchain.js";

@injectable()
export class BlockChainRoutesFactory {
  constructor(@inject(TYPES.BlockChain) private blockChain: BlockChain) { }

  create(): Router {
    const router = Router();

    router.get("/", (req, res) => {
      try {
        const chain = this.blockChain.getChain();
        res.json({ blockChain: chain });
      } catch (error: any) {
        res.status(500).json({ error: "Failed to get blockchain", details: error.message });
      }
    });
    router.get("/block", async (req, res) => {
      try {
        const index = parseInt(req.query.index as string);
        const block = this.blockChain.getBlock(index);
        if (block) {
          res.json({ block: block });
        } else {
          res.status(404).json({ error: "Block not found" });
        }
      } catch (error: any) {
        res
          .status(500)
          .json({ error: "Failed to get from blockchain", details: error.message });
      }
    });
    return router;
  }
}
