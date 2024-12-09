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
}

export default BlockchainApi;