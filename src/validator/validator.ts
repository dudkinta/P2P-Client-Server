import { Wallet } from "../wallet/wallet.js";
import { MessageChain } from "../network/services/messages/index.js";
class ValidatorEntry {
  public sender: string;
  public publicKey: string;
  public dt: number;
  public lastValidation: number;
  constructor(sender: string, publicKey: string) {
    this.sender = sender;
    this.publicKey = publicKey;
    this.dt = Date.now();
    this.lastValidation = Date.now() - 60 * 60 * 1000;
  }
}

export class Validator {
  private walletValidators: ValidatorEntry[] = [];
  private requiredValidators = 5;
  constructor() {}
  public addValidator(message: MessageChain): void {
    const wallet = message.value as Wallet;
    if (wallet.publicKey && message.sender) {
      this.walletValidators.push(
        new ValidatorEntry(
          message.sender.remotePeer.toString(),
          wallet.publicKey
        )
      );
    }
  }
  public removeValidator(message: MessageChain): void {
    if (message.sender) {
      const sender = message.sender.remotePeer.toString();
      this.walletValidators = this.walletValidators.filter(
        (validator) => validator.sender !== sender
      );
    }
  }

  selectValidators(): string[] {
    const now = Date.now();
    const elibgilePeers = this.walletValidators
      .filter((validator) => now - validator.dt > 5 * 60 * 1000)
      .sort(
        (a, b) =>
          a.lastValidation - b.lastValidation || now - b.dt - (now - a.dt)
      );

    const selected = elibgilePeers.slice(0, this.requiredValidators);
    selected.forEach((validator) => (validator.lastValidation = now));
    return selected.map((validator) => validator.publicKey);
  }
}
