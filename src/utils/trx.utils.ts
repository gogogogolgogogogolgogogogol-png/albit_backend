import { TronGasFree } from "@gasfree/gasfree-sdk";
import { BadRequestException } from "@nestjs/common";
import axios from "axios";
import { createHmac } from "crypto";
import { TronWeb } from "tronweb";

export const TRON_USDT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
export const TRON_USDT_DECIMALS = 6

export const MAX_FEE_IS_ACTIVATED = 1000000
export const MAX_FEE_NOT_ACTIVED = 2000000

export const gasFreeConfig = {
  chainId: 728126428,
  provider: 'https://api.trongrid.io', 
  gasFreeProvider: 'https://open.gasfree.io/tron',
  gasFreeApiKey: '8546c903-4d30-4f63-86da-c3b275c99e53',
  gasFreeApiSecret: 'kEOvXh9z_zTlQWyzFEopvlSGmpJtS1WchO-MEqBKJv4',
  verifyingContract: 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E',
  serviceProvider: 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E',
  transferMaxFee: 2_000_000
}

 export async function generateGasRequest(path: string, method: "GET" | "POST", config?: any) {
        const timestamp = Math.floor(Date.now() / 1000)

        const apiKey = process.env.GASFREE_API_KEY
        const apiS = process.env.GASFREE_API_SECRET
        if (!(apiS && apiKey)) throw new BadRequestException("Gasfree api secret not set")
        const msg = `${method}${path}${timestamp}`
        const sig = createHmac('sha256', Buffer.from(apiS, 'utf-8')).update(Buffer.from(msg, 'utf-8')).digest('base64').replace('0x', '')
        const headers = {
            'Timestamp': timestamp,
            'Authorization': `ApiKey ${apiKey}:${sig}`
        }
        switch (method) {
            case "GET":
                const respGet = await axios.get(`https://open.gasfree.io${path}`, {
                    headers: headers
                })

                return respGet.data
            case "POST":
                const respPost = await axios.post(`https://open.gasfree.io${path}`, config, {
                    headers: headers
                })

                return respPost.data
        }
}

interface WalletData { publicKey: string, privateKey: string }


export const tronGasFree = new TronGasFree({
  chainId: Number("0x2b6653dc")
})

export const TronApi = new TronWeb({
  fullHost: "https://api.trongrid.io"
})

export function isValidTronAddress(address: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

export async function generateTronWallet(): Promise<WalletData> {
  const account = await TronWeb.createAccount()

  return {
    publicKey: account.address.base58,
    privateKey: account.privateKey
  }
}