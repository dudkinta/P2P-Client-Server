import { Router } from "express";
import { Wallets } from "./../wallet.js"; // Подключаем существующую реализацию кошельков

const router = Router();

// Создать кошелек
router.post("/create", (req, res) => {
  try {
    const wallet = new Wallets();
    wallet.initialize();
    res.json({
      publicKey: wallet.publicKey,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to create wallet", details: error.message });
  }
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
