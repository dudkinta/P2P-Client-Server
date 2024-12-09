import ApiService from "./../../../shared/api"

class BlockchainApi extends ApiService {
    constructor() {
        super('/api/blockchain');
    }

    async getChain() {
        return this.get(`/`);
    }
    async getCurrentWallet(index) {
        return this.get(`/block?index=${index}`);
    }
    async getDelegates() {
        return this.get(`/delegates`);
    }
}

export default BlockchainApi;