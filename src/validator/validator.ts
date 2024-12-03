import { Wallet } from "../wallet/wallet.js";

class ValidatorEntry {
  public publicKey: string;
  public dt: number;
  public lastValidation: number;
  constructor(publicKey: string) {
    this.publicKey = publicKey;
    this.dt = Date.now();
    this.lastValidation = Date.now() - 60 * 60 * 1000;
  }
}

export class Validator {
  private walletValidators: ValidatorEntry[] = [];
  private requiredValidators = 5;
  constructor() {}
  public addValidator(wallet: Wallet): void {
    if (wallet.publicKey) {
      this.walletValidators.push(new ValidatorEntry(wallet.publicKey));
    }
  }
  public removeValidator(wallet: Wallet): void {
    this.walletValidators = this.walletValidators.filter(
      (validator) => validator.publicKey !== wallet.publicKey
    );
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
