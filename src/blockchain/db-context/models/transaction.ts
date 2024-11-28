import crypto from "crypto";

export class Transaction {
  public hash: string;
  public block?: string;
  public sender: string;
  public receiver: string;
  public amount: number;
  public timestamp: number;
  public signature?: string;

  constructor(
    sender: string,
    receiver: string,
    amount: number,
    timestamp: number
  ) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = amount;
    this.timestamp = timestamp;
    this.hash = this.calculateHash();
  }

  isValid(): boolean {
    if (!this.sender || !this.receiver || !this.amount || !this.signature) {
      console.error("Transaction is missing required fields.");
      return false;
    }

    if (this.amount <= 0) {
      console.error("Transaction amount must be greater than 0.");
      return false;
    }

    const verify = crypto.createVerify("SHA256");
    verify.update(this.getTransactionData()).end();

    const isSignatureValid = verify.verify(this.sender, this.signature, "hex");
    if (!isSignatureValid) {
      console.error("Invalid transaction signature.");
      return false;
    }

    return true;
  }

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(this.getTransactionData())
      .digest("hex");
  }

  getTransactionData(): string {
    return JSON.stringify({
      sender: this.sender,
      receiver: this.receiver,
      amount: this.amount,
      timestamp: this.timestamp,
    });
  }
}
