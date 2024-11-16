import { promises as fs } from "fs";

export interface Protocols {
  PING: string;
  ROLE: string;
  PEER_LIST: string;
  MULTIADDRES: string;
}
export interface Roles {
  RELAY: string;
  NODE: string;
}

export interface Config {
  port: number;
  listen: string[];
  protocols: Protocols;
  roles: Roles;
  MAX_NODES: number;
}

class ConfigLoader {
  private static instance: ConfigLoader;
  private config: Config;
  private knowsRelay: string[];

  private constructor(config: Config, knowsRelay: string[]) {
    this.config = config;
    this.knowsRelay = knowsRelay;
  }

  public static async initialize(): Promise<void> {
    if (!ConfigLoader.instance) {
      const data = await fs.readFile("./config.json", "utf-8");
      const parsedConfig = JSON.parse(data);
      const relaysStr = await fs.readFile("./knows/relay.knows", "utf-8");
      const relaysArr: string[] = relaysStr.split("\r\n");
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
}

export default ConfigLoader;
