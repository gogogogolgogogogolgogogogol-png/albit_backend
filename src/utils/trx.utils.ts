import { TronWeb } from "tronweb";

export const TRON_USDT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
export const TRON_USDT_DECIMALS = 6

export const TronApi = new TronWeb({
  fullHost: "https://api.trongrid.io"
})

export function isValidTronAddress(address: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}