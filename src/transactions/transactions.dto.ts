import { TransactionToken } from "@prisma/client"

export interface DepositRequest {
    txHash: string
}

export interface SwapRequest {
    from: {
        token: TransactionToken,
        amount: number
    },
    to: {
        token: TransactionToken,
    }
    alb_usdt_rate: number
}