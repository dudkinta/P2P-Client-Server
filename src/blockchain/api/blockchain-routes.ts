import { Router } from "express";
import { BlockChain } from "../blockchain.js";
import { P2PClient } from "../../network/p2p-сlient.js";
const router = Router();

router.get("/", async (req, res) => {
  try {
    const blockchain = BlockChain.getInstance();
    const chain = blockchain.getChain();
    res.json({ blockChain: chain });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to get blockchain", details: error.message });
  }
});
router.get("/block", async (req, res) => {
  try {
    const blockchain = BlockChain.getInstance();
    const index = parseInt(req.query.index as string);
    const block = blockchain.getBlock(index);
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
router.get("/delegates", async (req, res) => {
  try {
    const p2pClient = P2PClient.getInstance();
    if (p2pClient) {
      //const keys = await p2pClient.getFromDHT('publicKey');
      res.json({ neighbors: [] });
    } else {
      res.status(404).json({ error: "Block not found" });
    }
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to get neighbors", details: error.message });
  }
});
export default router;
