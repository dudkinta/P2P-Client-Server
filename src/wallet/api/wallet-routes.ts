import { Router } from "express";
import { Wallet } from "./../wallet.js"; // Подключаем существующую реализацию кошельков

const router = Router();

//получение всех кошельков
router.get("/", async (req, res) => {
  try {
    await Wallet.initialize();
    const wallets = Wallet.instances;
    if (wallets.length === 0) {
      res.status(400).json({ error: "No wallets found", wallets: [] });
      return;
    }
    res.json(
      wallets.map((wallet) => ({
        publicKey: wallet.publicKey,
        name: wallet.walletName,
        path: wallet.keyPath,
        subname: wallet.subname,
      }))
    );
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to create wallet", details: error.message });
  }
});

router.get("/current", async (req, res) => {
  try {
    const wallet = Wallet.current;
    if (!wallet) {
      res.status(400).json({ error: "No current wallet" });
      return;
    }
    res.json({
      publicKey: wallet.publicKey,
      name: wallet.walletName,
      path: wallet.keyPath,
      subname: wallet.subname,
    });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to select current wallet",
      details: error.message,
    });
  }
});

router.get("/create", async (req, res) => {
  try {
    const name = req.query.name as string;

    if (!name) {
      res.status(400).json({ error: "No name provided" });
      return;
    }

    const wallet = await Wallet.create(name);
    res.json({
      publicKey: wallet.publicKey,
      name: wallet.walletName,
      path: wallet.keyPath,
      subname: wallet.subname,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to create wallet", details: error.message });
  }
});

router.put("/use", async (req, res) => {
  const name = req.query.name as string;
  const subname = req.query.subname as string;
  const wallets = Wallet.instances;
  const wallet = wallets.find(
    (_) => _.walletName === name && _.subname === subname
  );
  if (!wallet) {
    res.status(400).json({ error: "No wallet found" });
    return;
  }
  Wallet.use(wallet);
  res
    .status(200)
    .json({ message: `Wallet ${wallet.walletName}/${wallet.subname} in use` });
});

// Получить баланс
/*router.post("/balance", (req, res) => {
  const { address } = req.body;

  try {
    // Пример: Вызов метода кошелька для получения баланса
    const balance = Wallet.getBalance(address); // Метод getBalance должен быть определен в Wallet
    res.json({
      address,
      balance,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to fetch balance", details: error.message });
  }
});*/

// Отправить транзакцию
/*router.post("/send", (req, res) => {
  const { privateKey, to, amount } = req.body;

  try {
    // Пример: Отправка транзакции
    const transaction = Wallet.sendTransaction(privateKey, to, amount); // Метод sendTransaction должен быть определен
    res.json({ transactionHash: transaction.hash });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to send transaction", details: error.message });
  }
});*/

export default router;
