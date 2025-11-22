import { Transaction, TransactionStatus, TransactionToken, TransactionType } from "@prisma/client"

export interface ITransaction {
    id: number
    hash: string | null
    type: TransactionType
    feeUsdt: number | null
    ref_lvl: number | null
    status: TransactionStatus
    alb_alt_rate: number | null
    alt_usdt_rate: number | null
    from_token: TransactionToken | null
    from_amount: number | null
    isLocked: boolean
    lockedUntil: number | null
    to_token: TransactionToken
    to_amount: number
    createdAt: number
}

export interface DepositRequest {
    hash: string
}

export interface DepositResponse {
    transaction: ITransaction,
    status: string,
    signature: string,
    alt_amount: number,
    usdt_amount: number
}

export interface SwapRequest {
    from: {
        token: TransactionToken,
        amount: number
    },
    to: {
        token: TransactionToken,
    }
    alb_alt_rate: number
}

export interface SwapResponse {
    transaction: ITransaction
    fromAmount: number
    toAmount: number
    toToken: string
    takeFromDividends?: number
}

export interface ReinvestRequest {
    alb_alt_rate: number
    amount: number
}

export interface ReinvestResponse {
    transaction: ITransaction
    status: string
    amount: number
    takeFromBalance: number
}

export interface WithdrawRequest {
    amount: number
    alt_usdt_rate: number
}

export interface WithdrawResponse {
    transaction: ITransaction
    isTakeFromDividends: boolean
    alt_amount: number
    alt_dividends: number
    usdt_amount: number
}