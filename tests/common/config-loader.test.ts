import { ConfigLoader } from './../../src/common/config-loader.js';
import { promises as fs } from "fs";

jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },
}));

describe("ConfigLoader with fs mock", () => {
    const mockConfig = {
        net: "testnet",
        nodeType: "chainnode",
        port: 6000,
        wsport: 3000,
        listen: ["/ip4/0.0.0.0/tcp/", "/ip6/::/tcp/"],
        protocols: {
            "STORE": "/chain/store/1.0.0",
            "ROLE": "/chain/roles/1.0.0",
            "PEER_LIST": "/chain/peers/1.0.0",
            "MULTIADDRES": "/chain/multiadres/1.0.0"
        },
        roles: {
            RELAY: "chainrelay",
            NODE: "chainnode"
        },
        MAX_NODES: 64
    };

    const mockRelays = [
        "/ip4/31.172.66.148/tcp/6007/p2p/12D3KooWHRFd91aE4CzhLu81mj1o3xC1em6CFePrRXDQk85DwuhP",
        "/ip4/31.172.66.148/tcp/6008/p2p/12D3KooWMBLawD7xsuDXVeYKoJbiYxvjoqxUiPZAVYKeqrg9eX8g",
        "/ip4/31.172.66.148/tcp/6009/p2p/12D3KooWMrwdrLhZJALfBiWSY43hFwFjTTYCfhjTpKyxrpMyVgQG"
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        // Мокаем чтение файлов
        (fs.readFile as jest.Mock).mockImplementation((path: string) => {
            if (path === "./data/config.json") {
                return Promise.resolve(JSON.stringify(mockConfig));
            }
            if (path === "./data/testnet/relay.knows") {
                return Promise.resolve(JSON.stringify(mockRelays));
            }
            return Promise.reject(new Error("File not found"));
        });

        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it("should throw an error if getInstance is called before initialize", () => {
        expect(() => ConfigLoader.getInstance()).toThrow(
            "ConfigLoader is not initialized. Call initialize() first."
        );
    });

    it("should initialize and load configuration correctly", async () => {
        await ConfigLoader.initialize();

        const instance = ConfigLoader.getInstance();
        expect(instance.getConfig()).toEqual(mockConfig);
        expect(instance.getRelays()).toEqual(mockRelays);
    });



    it("should save a new relay", async () => {
        const instance = ConfigLoader.getInstance();

        const newRelay = "/ip4/192.168.1.1/tcp/4001/p2p/12D3KooWMrwdrLhZJALfBiWSY43hFwFjTTYCfhjTpKyxrpMyVgQQ";
        instance.saveRelay(newRelay);

        expect(fs.writeFile).toHaveBeenCalledWith(
            "./data/testnet/relay.knows",
            JSON.stringify([...mockRelays, newRelay], null, 2)
        );
    });

    it("should identify known and unknown relays", async () => {
        const instance = ConfigLoader.getInstance();

        expect(instance.isKnownRelay("12D3KooWMrwdrLhZJALfBiWSY43hFwFjTTYCfhjTpKyxrpMyVgQQ")).toBe(true);
        expect(instance.isKnownRelay("12D3KooWMrwdrLhZJALfBiWSY43hFwFjTTYCfhjTpKyxrpMyVgQE")).toBe(false);
    });
});