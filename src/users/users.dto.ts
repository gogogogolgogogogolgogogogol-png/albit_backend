import { Transaction, Lang } from "@prisma/client"

export interface ChangeWithdrawAddressRequest {
    address: string
}

export interface ChangeWithdrawAddressResponse {
    status: string
    response: {
        data: {
            address: string
        }
    }
}

export interface ChangeLangRequest {
    lang: Lang
}

export interface ChangeLangResponse {
    status: string
    response: {
        data: {
            lang: Lang
        }
    }
}


type ReferralLevel = { 
            count: number,
            percent: number,
            totalBonuses: number,
        }

export interface GetMeResponse {
    balances: {
        alt_balance: number
        alt_in_usd_balance: number
        alb_balance: number
    }
    history_all: Transaction[]
    withdraw_address: string
    deposit_address: string
    earned: {
        performance: number,
        all_amount_alt: number,
        week_amount_alt: number
    }
    minimal_amounts: {
        deposit: number,
        withdraw: number,
        alb_alt_min_amount: number,
        alt_alb_min_amount: number
    }
    rates: {
        alt_usdt_rate: number
        alb_alt_rate: number
    }
    referrals: {
        count: number
        active: number
        totalBonuses: number
        link: string
        lvl1: ReferralLevel,
        lvl2: ReferralLevel,
        lvl3: ReferralLevel,
        lvl4: ReferralLevel,
        lvl5: ReferralLevel
    }
}
