import ApiService from "./../../../shared/api"

class WalletApi extends ApiService {
    constructor() {
        super('/api/wallet');
    }

    async createWallet(name) {
        return this.get(`/create?name=${name}`);
    }

    async getWallets() {
        return this.get(`/`);
    }
    async getCurrentWallet() {
        return this.get(`/current`);
    }

    async useWallet(wallet) {
        return this.put(`/use?name=${wallet.name}&subname=${wallet.subname}`);
    }
    /*async sendTransaction(privateKey, to, amount) {
        return this.post('/send', { privateKey, to, amount });
    }*/
}

export default WalletApi;