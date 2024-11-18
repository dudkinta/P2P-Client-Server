import { Multiaddr } from "@multiformats/multiaddr";
import axios from "axios";
import net from "net";

export function isLocalMultiAddress(addr: Multiaddr): boolean {
  // Парсим мультиадрес в строку
  const addrStr = addr.toString();

  // Проверка для локального IPv4 адреса (localhost и частные адреса)
  if (
    addrStr.includes("/ip4/127.") || // IPv4 localhost (127.0.0.0/8)
    addrStr.includes("/ip4/10.") || // IPv4 private network (10.0.0.0/8)
    addrStr.match(/\/ip4\/192\.168\.\d+\.\d+/) || // IPv4 private network (192.168.0.0/16)
    addrStr.match(/\/ip4\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/) // IPv4 private network (172.16.0.0 - 172.31.255.255)
  ) {
    return true;
  }

  // Проверка для локального IPv6 адреса (localhost и link-local addresses)
  if (
    addrStr.includes("/ip6/::1") || // IPv6 localhost (::1)
    addrStr.includes("/ip6/fe80:") || // IPv6 link-local (fe80::/10)
    addrStr.match(/\/ip6\/fc[0-9a-f]{2}/) || // IPv6 ULA (fc00::/7)
    addrStr.match(/\/ip6\/fd[0-9a-f]{2}/) // IPv6 ULA (fd00::/8)
  ) {
    return true;
  }
  return false;
}

export function isLocalAddress(addrStr: string): boolean {
  // Парсим мультиадрес в строку

  // Проверка для локального IPv4 адреса (localhost и частные адреса)
  if (
    addrStr.includes("/ip4/127.") || // IPv4 localhost (127.0.0.0/8)
    addrStr.includes("/ip4/10.") || // IPv4 private network (10.0.0.0/8)
    addrStr.match(/\/ip4\/192\.168\.\d+\.\d+/) || // IPv4 private network (192.168.0.0/16)
    addrStr.match(/\/ip4\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/) // IPv4 private network (172.16.0.0 - 172.31.255.255)
  ) {
    return true;
  }

  // Проверка для локального IPv6 адреса (localhost и link-local addresses)
  if (
    addrStr.includes("/ip6/::1") || // IPv6 localhost (::1)
    addrStr.includes("/ip6/fe80:") || // IPv6 link-local (fe80::/10)
    addrStr.match(/\/ip6\/fc[0-9a-f]{2}/) || // IPv6 ULA (fc00::/7)
    addrStr.match(/\/ip6\/fd[0-9a-f]{2}/) // IPv6 ULA (fd00::/8)
  ) {
    return true;
  }
  return false;
}

export function isDirect(address: string): boolean {
  const regex =
    /^\/ip4\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/tcp\/(\d{1,5})(\/ws)?\/p2p\/[A-Za-z0-9]+$/;
  const isMatch = regex.test(address);
  const containsRelay = address.includes("/p2p-circuit/");
  return isMatch && !containsRelay;
}

export function isWEBRTC(address: string): boolean {
  const regex = /^\/webrtc\/p2p\/[A-Za-z0-9]+$/;
  return regex.test(address);
}

export function isRelay(address: string): boolean {
  const regex = /^\/p2p-circuit\/p2p\/[A-Za-z0-9]+$/;
  return regex.test(address);
}

export interface CheckResult {
  ipv4: string | null;
  ipv6: string | null;
  port: number;
  ipv4portOpen: boolean;
  ipv6portOpen: boolean;
  error?: string;
}

async function getExternalIPv4(): Promise<string | null> {
  try {
    const response = await axios.get("https://api.ipify.org?format=json");
    return response.data.ip;
  } catch (error) {
    console.error("Ошибка при получении IPv4:");
    return null;
  }
}

async function getExternalIPv6(): Promise<string | null> {
  try {
    const response = await axios.get("https://api6.ipify.org?format=json");
    return response.data.ip;
  } catch (error) {
    console.error("Ошибка при получении IPv6:");
    return null;
  }
}

async function isPortOpen(
  port: number,
  host: string,
  timeout: number = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      isResolved = true;
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on("error", () => {
      if (!isResolved) {
        isResolved = true;
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

export async function getIpAndCheckPort(port: number): Promise<CheckResult> {
  try {
    // Получаем IPv4 и IPv6 адреса
    let [ipv4, ipv6] = await Promise.all([
      getExternalIPv4(),
      getExternalIPv6(),
    ]);

    // Проверяем доступность порта для IPv4
    let ipv4portOpen = false;
    if (ipv4) {
      ipv4portOpen = await isPortOpen(port, ipv4);
    }

    // Если IPv6 доступен, можно дополнительно проверить и его
    let ipv6portOpen = false;
    if (ipv6) {
      ipv6portOpen = await isPortOpen(port, ipv6);
    }
    if (ipv4 == ipv6) {
      ipv6 = null;
    }
    return {
      ipv4,
      ipv6,
      port,
      ipv4portOpen,
      ipv6portOpen,
    };
  } catch (error) {
    return {
      ipv4: null,
      ipv6: null,
      port: port,
      ipv4portOpen: false,
      ipv6portOpen: false,
      error: (error as Error).message,
    };
  }
}
