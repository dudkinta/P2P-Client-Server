import { PingService } from "./ping.js";

export function ping(init = {}) {
    return (components) => new PingService(components, init);
}