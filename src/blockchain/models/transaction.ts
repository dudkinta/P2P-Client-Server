import crypto from "crypto";

export class Transaction {
  sender: string; // Публичный ключ отправителя
  receiver: string; // Публичный ключ получателя
  amount: number;
  signature?: string; // Подпись транзакции
  constructor(sender: string, receiver: string, amount: number) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = amount;
  }

  // Проверка валидности транзакции
  isValid(): boolean {
    // 1. Проверка обязательных полей
    if (!this.sender || !this.receiver || !this.amount || !this.signature) {
      console.error("Transaction is missing required fields.");
      return false;
    }

    // 2. Проверка суммы
    if (this.amount <= 0) {
      console.error("Transaction amount must be greater than 0.");
      return false;
    }

    // 3. Проверка подписи
    const transactionData = `${this.sender}${this.receiver}${this.amount}`;
    const verify = crypto.createVerify("SHA256");
    verify.update(transactionData).end();

    const isSignatureValid = verify.verify(this.sender, this.signature, "hex");
    if (!isSignatureValid) {
      console.error("Invalid transaction signature.");
      return false;
    }

    return true;
  }
}
