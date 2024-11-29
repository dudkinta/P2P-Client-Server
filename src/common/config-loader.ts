import { multiaddr } from "@multiformats/multiaddr";
import { promises as fs } from "fs";

export interface Protocols {
  STORE: string;
  ROLE: string;
  PEER_LIST: string;
  MULTIADDRES: string;
}
export interface Roles {
  RELAY: string;
  NODE: string;
}
export interface Storage {
  db_host: string;
  db_port: number;
  db_name: string;
  db_user: string;
  db_password: string;
}
export interface Config {
  net: string;
  nodeType: string;
  port: number;
  wsport: number;
  listen: string[];
  protocols: Protocols;
  roles: Roles;
  storage: Storage;
  MAX_NODES: number;
}

class ConfigLoader {
  static instance: ConfigLoader;
  private config: Config;
  private knowsRelay: string[];
  private readonly net: string;
  private constructor(config: Config, knowsRelay: string[]) {
    this.config = config;
    this.net = config.net;
    this.knowsRelay = knowsRelay;
  }

  public static async initialize(): Promise<void> {
    if (!ConfigLoader.instance) {
      const data = await fs.readFile(`./data/config.json`, "utf-8");
      const parsedConfig = JSON.parse(data);
      const net = parsedConfig.net;
      const relaysStr = await fs.readFile(`./data/${net}/relay.knows`, "utf-8");
      const relaysArr: string[] = JSON.parse(relaysStr);
      ConfigLoader.instance = new ConfigLoader(parsedConfig, relaysArr);
    }
  }

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      throw new Error(
        "ConfigLoader is not initialized. Call initialize() first."
      );
    }
    return ConfigLoader.instance;
  }

  public getConfig(): Config {
    return this.config;
  }
  public getRelays(): string[] {
    return this.knowsRelay;
  }
  public saveRelay(addr: string): void {
    this.knowsRelay.push(addr);
    fs.writeFile(
      `./data/${this.net}/relay.knows`,
      JSON.stringify(this.knowsRelay, null, 2)
    );
  }

  public isKnownRelay(peer: string): boolean {
    const relayIds = this.knowsRelay.map((element) => {
      const ma = multiaddr(element);
      return ma.getPeerId();
    });
    return relayIds.includes(peer);
  }
}

export default ConfigLoader;
