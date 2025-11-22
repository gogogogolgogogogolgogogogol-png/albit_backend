import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { generateGasRequest, MAX_FEE_IS_ACTIVATED, MAX_FEE_NOT_ACTIVED, TRON_USDT_ADDRESS, TRON_USDT_DECIMALS, TronApi, tronGasFree } from "src/utils/trx.utils";
import { DepositResponse, ITransaction, ReinvestResponse, SwapRequest, SwapResponse, WithdrawResponse } from "./transactions.dto";
import { Prisma, Transaction, TransactionStatus, TransactionToken, TransactionType, User, Wallet } from "@prisma/client";
import { TronWeb } from "tronweb";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import axios from "axios"
import { MAX_REF_LVL } from "src/utils/app.utils";
import { Cron } from "@nestjs/schedule";

@Injectable()
export class TransactionsService implements OnModuleInit {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService
    ) {}

    @Cron("0 3 * * *", {
        timeZone: "UTC"
    })
    // @Cron("16 18 * * *")
    async nightCron() {
        console.log('night cron')
        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new Error("settings not found")

        const currentIncome = settings.daily_income_alb_percent

        const wallets = await this.prisma.wallet.findMany({ where: { alb_balance: { gt: 0 } }, include: { user: true } })
        for (const wallet of wallets) {
            const currentIncomeFloat = currentIncome / 100
            const albAmount = wallet.alb_balance * currentIncomeFloat
            const rate = settings.alb_alt_rate
            const altAmount = albAmount * rate

            await this.prisma.$transaction([
                this.prisma.wallet.update({
                    where: { id: wallet.id },
                    data: {
                        alt_dividends: {
                            increment: altAmount
                        }
                    }
                }),
                this.prisma.transaction.create({
                    data: {
                        type: TransactionType.DIVIDENDS,
                        status: TransactionStatus.COMPLETED,
                        alb_alt_rate: rate,
                        to_token: TransactionToken.ALT,
                        to_amount: altAmount,
                        walletId: wallet.id,
                    }
                })
            ])

            const referrerUserByLevel: Record<number, User> = {}

            if (wallet.user?.referrerId) {
                for (let lvl = 1; lvl <= MAX_REF_LVL; lvl++) {
                    const referrerPrev = referrerUserByLevel[lvl - 1]

                    if (!wallet.user?.referrerId) break
                    if (lvl > 1 && !referrerPrev?.referrerId) break

                    const referrer = await this.prisma.user.findUnique({ 
                        where: { id: lvl == 1 ? wallet.user.referrerId : referrerPrev.referrerId!! }, 
                        include: { wallet: true }
                    })

                    if (!referrer) break

                    referrerUserByLevel[lvl] = referrer

                    if (!(referrer && referrer?.wallet)) continue

                    const refWallet = await this.prisma.wallet.findUnique({ where: { id: referrer.wallet.id } })

                    if (!refWallet) continue

                    const refLvlPercent: Record<number, number> = {
                        1: settings.ref_lvl1_bonus_percent,
                        2: settings.ref_lvl2_bonus_percent,
                        3: settings.ref_lvl3_bonus_percent,
                        4: settings.ref_lvl4_bonus_percent,
                        5: settings.ref_lvl5_bonus_percent
                    }

                    const refLvlMinAmount: Record<number, number> = {
                        1: settings.ref_lvl1_bonus_min_alb,
                        2: settings.ref_lvl2_bonus_min_alb,
                        3: settings.ref_lvl3_bonus_min_alb,
                        4: settings.ref_lvl4_bonus_min_alb,
                        5: settings.ref_lvl5_bonus_min_alb
                    }

                    if (refLvlMinAmount[lvl] > refWallet.alt_balance) continue

                    const refPercent = refLvlPercent[lvl] / 100
                    const usdtAmountRef = refPercent * altAmount * settings.alt_usdt_rate
                    const altAmountRef = refPercent * altAmount

                    await this.prisma.$transaction([
                        this.prisma.wallet.update({
                            where: { id: refWallet.id },
                            data: { 
                                alt_balance: {
                                    increment: altAmountRef
                                }
                            }
                        }),
                        this.prisma.transaction.create({
                            data: {
                                status: TransactionStatus.COMPLETED,
                                type: TransactionType.BONUS,
                                ref_lvl: lvl,
                                alt_usdt_rate: settings.alt_usdt_rate,
                                from_token: TransactionToken.USDT,
                                from_amount: usdtAmountRef,
                                to_token: TransactionToken.ALT,
                                to_amount: altAmountRef,
                                walletId: refWallet.id,
                            }
                        })
                    ])
                }
            }

        }

        if (settings.future_daily_income_alb_percent != currentIncome) {
            await this.prisma.settings.update({ where: { id: settings.id }, data: { daily_income_alb_percent: settings.future_daily_income_alb_percent } })
        }
    }

    @Cron("* * * * *")
    async cron() {
        const transactions = await this.prisma.transaction.findMany({ where: { isLocked: true, lockedUntil: { lte: new Date(Date.now()) } } })

        console.log('cron transactions', transactions)

        for (const tx of transactions) {
            switch (tx.type) {
                case TransactionType.SWAP: {
                    if (tx.to_token == TransactionToken.ALB) {
                        await this.prisma.$transaction([
                            this.prisma.wallet.update({ 
                                where: { id: tx.walletId },
                                data: {
                                    locked_alb_balance: {
                                        decrement: tx.to_amount
                                    },
                                    alb_balance: {
                                        increment: tx.to_amount
                                    }
                                }
                            }),
                            this.prisma.transaction.update({
                                where: { id: tx.id },
                                data: { 
                                    isLocked: false,
                                    status: TransactionStatus.COMPLETED,
                                    lockedUntil: null,
                                }
                            })
                        ])
                    } else if (tx.to_token == TransactionToken.ALT) {
                        await this.prisma.$transaction([
                            this.prisma.wallet.update({ 
                                where: { id: tx.walletId },
                                data: {
                                    locked_alt_balance: {
                                        decrement: tx.to_amount
                                    },
                                    alt_balance: {
                                        increment: tx.to_amount
                                    }
                                }
                            }),
                            this.prisma.transaction.update({
                                where: { id: tx.id },
                                data: { 
                                    isLocked: false,
                                    status: TransactionStatus.COMPLETED,
                                    lockedUntil: null,
                                }
                            })
                        ])
                    }
                
                    

                    break
                }
                case TransactionType.REINVEST: {
                    await this.prisma.$transaction([
                        this.prisma.wallet.update({ 
                            where: { id: tx.walletId },
                            data: {
                                locked_alb_balance: {
                                    decrement: tx.to_amount
                                },
                                alb_balance: {
                                    increment: tx.to_amount
                                }
                            }
                        }),
                        this.prisma.transaction.update({
                            where: { id: tx.id },
                            data: { 
                                isLocked: false,
                                status: TransactionStatus.COMPLETED,
                                lockedUntil: null,
                            }
                        })
                    ])

                    break
                }
                default: {
                    await this.prisma.transaction.update({
                        where: { id: tx.id },
                        data: { isLocked: false, lockedUntil: null, status: TransactionStatus.PENDING }
                    })

                    break
                }
            } 
        }
    }

    async onModuleInit() {
        // this.deposit("5001901028", "ee5b2aaa574bd7b85179912569115f7bd3c47e448ad858adcfde420db18e59e2").then(res => console.log(res))
    }

    private transformTransaction(e: Transaction) {
        return {
            id: e.id,
            hash: e.hash,
            type: e.type,
            feeUsdt: e.feeUsdt,
            status: e.status,
            ref_lvl: e.ref_lvl,
            alb_alt_rate: e.alb_alt_rate,
            alt_usdt_rate: e.alt_usdt_rate,
            from_token: e.from_token,
            from_amount: e.from_amount,
            isLocked: e.isLocked,
            lockedUntil: e.lockedUntil !== null ? e.lockedUntil.getTime() : null,
            to_token: e.to_token,
            to_amount: e.to_amount,
            createdAt: e.createdAt.getTime()
        }
    }
    
    async history(tgId: string, offset: number, limit: number, sortType: "desc" | "asc", transactionType?: string): Promise<ITransaction[]> {
        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")
        
        const transactions = await this.prisma.transaction.findMany({ 
            where: {
                walletId: user.wallet.id,
                ...transactionType ? {
                    type: TransactionType[transactionType]
                } : {},
            },
            take: Number(limit), 
            skip: Number(offset),
            orderBy: { 
                createdAt: sortType
            }
        })

        return transactions.map(e => this.transformTransaction(e))
    }

    async swap(tgId: string, dto: SwapRequest): Promise<SwapResponse> {
        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")

        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new BadRequestException("settings not found")

        if ((dto.from.token == TransactionToken.ALT) && (dto.to.token == TransactionToken.ALB)) {
            if (dto.from.amount < settings.min_swap_alt_amount) throw new BadRequestException("less then min amount")

            // lock 3 days without dividends
            const alt_alb_rate = 1 / settings.alb_alt_rate
            const alb_amount = dto.from.amount * alt_alb_rate

            const totalBalance = user.wallet.alt_balance + user.wallet.alt_dividends
            const amountWithLocked = user.wallet.alt_balance + user.wallet.locked_alt_balance
            const isEnoughWithLocked = amountWithLocked >= dto.from.amount

            if (settings.alb_alt_rate != dto.alb_alt_rate) throw new BadRequestException("rate refresh")

            if (dto.from.amount > totalBalance && isEnoughWithLocked) {
                throw new BadRequestException("locked:" + amountWithLocked)
            } else if (dto.from.amount > totalBalance) {
                throw new BadRequestException("insufficient balance")
            }

            const isTakeFromDividends = user.wallet.alt_balance < dto.from.amount
            const takeFromDividends = dto.from.amount - user.wallet.alt_balance
            const taked_alt_from_balance = isTakeFromDividends ? user.wallet.alt_balance : dto.from.amount

            const [resWallet, resTx] = await this.prisma.$transaction([
                this.prisma.wallet.update({ where: { id: user.wallet.id }, data: {
                    alt_balance: {
                        decrement: taked_alt_from_balance
                    },
                    ...isTakeFromDividends ? {
                        alt_dividends: {
                            decrement: takeFromDividends
                        }
                    } : {},
                    locked_alb_balance: {
                        increment: alb_amount
                    }
                } }),
                this.prisma.transaction.create({
                    data: {
                        type: TransactionType.SWAP,
                        status: TransactionStatus.FROZEN,
                        isLocked: true,
                        lockedUntil: new Date(Date.now() + settings.alt_alb_cooldown_days * 24 * 60 * 60 * 1000),
                        alb_alt_rate: settings.alb_alt_rate,
                        from_token: TransactionToken.ALT,
                        from_amount: dto.from.amount,
                        to_token: TransactionToken.ALB,
                        to_amount: alb_amount,
                        walletId: user.wallet.id,
                    }
                })
            ])

            return {
                transaction: this.transformTransaction(resTx),
                fromAmount: dto.from.amount,
                toToken: TransactionToken.ALB,
                toAmount: alb_amount
            }
        } else if ((dto.from.token == TransactionToken.ALB) && (dto.to.token == TransactionToken.ALT)) {
            if (dto.from.amount < settings.min_swap_alb_amount) throw new BadRequestException("less then min amount")

            const alb_alt_rate = settings.alb_alt_rate
            const alt_amount = dto.from.amount * alb_alt_rate

            const amountWithLocked = user.wallet.alb_balance + user.wallet.locked_alb_balance
            const isEnough = user.wallet.alb_balance >= dto.from.amount
            const isEnoughWithLocked = amountWithLocked >= dto.from.amount

            if (settings.alb_alt_rate != dto.alb_alt_rate) throw new BadRequestException("rate refresh")

            if (!isEnough && isEnoughWithLocked) {
                throw new BadRequestException("locked:" + amountWithLocked)
            } else if (!isEnough) {
                throw new BadRequestException("insufficient balance")
            }

            const [resWallet, resTx] = await this.prisma.$transaction([
                this.prisma.wallet.update({ where: { id: user.wallet.id }, data: {
                    alb_balance: {
                        decrement: dto.from.amount
                    },
                    locked_alt_balance: {
                        increment: alt_amount
                    }
                } }),
                this.prisma.transaction.create({
                    data: {
                        status: TransactionStatus.FROZEN,
                        isLocked: true,
                        lockedUntil: new Date(Date.now() + settings.alb_alt_cooldown_days * 24 * 60 * 60 * 1000),
                        type: TransactionType.SWAP,
                        alb_alt_rate: settings.alb_alt_rate,
                        from_token: TransactionToken.ALB,
                        from_amount: dto.from.amount,
                        to_token: TransactionToken.ALT,
                        to_amount: alt_amount,
                        walletId: user.wallet.id,
                    }
                })
            ])

            return {
                transaction: this.transformTransaction(resTx),
                fromAmount: dto.from.amount,
                toToken: TransactionToken.ALT,
                toAmount: alt_amount
            }
        } else {
            throw new BadRequestException("wrong tokens")
        }
    }

    private async executeGasfreeTransaction(user: any, value: string, maxFee: string) {
        const dead = Math.floor((Date.now()+1000*60) / 1000).toString()

                console.log(dead)

                console.log(user.wallet.address)
                
                let config = {
                    token: TRON_USDT_ADDRESS,
                    user: user.wallet.address,
                    serviceProvider: '',
                    receiver: this.config.get("ADMIN_WALLET")!!,
                    value,
                    maxFee,
                    deadline: dead,
                    version: '1',
                    nonce: '0',
                }

                const apiK = this.config.get("GASFREE_API_KEY")
                if (!apiK) throw new BadRequestException("Gasfree api key not set")

                const pathFetchAddress = `/tron/api/v1/address/${user.wallet.address}`
                const respFetchAddress = await generateGasRequest(pathFetchAddress, "GET")

                const nonce = respFetchAddress.data.nonce

                const pathFetchProvider = '/tron/api/v1/config/provider/all'
                const respFetchProvider = await generateGasRequest(pathFetchProvider, "GET")

                const serviceProvider = respFetchProvider.data.providers[0].address
                console.log(serviceProvider)

                config.serviceProvider = serviceProvider
                config.nonce = nonce.toString()

                const { domain, message, types } = tronGasFree.assembleGasFreeTransactionJson(config);

                const signature = TronApi.trx._signTypedData(domain, types, message, user.wallet.privateKey);

                config['sig'] = signature

                const pathGasSubmit = '/tron/api/v1/gasfree/submit'
                const respGasSubmit = await generateGasRequest(pathGasSubmit, "POST", config)
                
        console.log(respGasSubmit)
    }

    private async addDepositBonus(referrerId: number, ref_lvl1_bonus_deposit_percent: number, deposit_amount_usdt: number, deposit_amount_alt: number, txHash: string, alt_usdt_rate: number): Promise<boolean> {
        const referrer = await this.prisma.user.findUnique({ 
                    where: { id: referrerId }, 
                    include: { wallet: true }
                })

                if (!(referrer && referrer?.wallet)) return false

                const refWallet = await this.prisma.wallet.findUnique({ where: { id: referrer.wallet.id } })

                if (!refWallet) return false

                const refPercent = ref_lvl1_bonus_deposit_percent / 100
                const usdtAmountRef = refPercent * deposit_amount_usdt
                const altAmountRef = refPercent * deposit_amount_alt

                await this.prisma.$transaction([
                    this.prisma.wallet.update({
                        where: { id: refWallet.id },
                        data: { 
                            alt_balance: {
                                increment: altAmountRef
                            }
                        }
                    }),
                    this.prisma.transaction.create({
                        data: {
                            status: TransactionStatus.COMPLETED,
                            type: TransactionType.BONUS,
                            hash: txHash,
                            ref_lvl: 1,
                            alt_usdt_rate: alt_usdt_rate,
                            from_token: TransactionToken.USDT,
                            from_amount: usdtAmountRef,
                            to_token: TransactionToken.ALT,
                            to_amount: altAmountRef,
                            walletId: refWallet.id,
                        }
                    })
                ])

                return true
    }

    async deposit(tgId: string, txHashWithSpaces: string): Promise<DepositResponse> {
        const txHash = txHashWithSpaces.replaceAll(" ", "")

        const txExists = await this.prisma.transaction.findFirst({ where: { hash: txHash } })
        if (txExists) throw new BadRequestException("transaction exists")

        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")

        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new BadRequestException("settings not found")

        const txInfo = await TronApi.trx.getTransactionInfo(txHash)
        const txLogs = txInfo.log

        console.log(txInfo)

        if (!txLogs?.length) throw new BadRequestException("tx must have logs")

        let totalAmount = 0

        for (const txLog of txLogs) {
            const tokenAddress = TronWeb.address.fromHex(`41${txLog.address}`)
            const toAddress = TronWeb.address.fromHex(`41${txLog.topics[2].slice(-40)}`)

            console.log(tokenAddress, toAddress)
            if (tokenAddress != TRON_USDT_ADDRESS || toAddress != user.wallet.gasFreeAddress) continue

            const amount = parseInt(txLog.data, 16)
            totalAmount += amount
        }
        
        console.log(totalAmount, settings.deposit_min_amount)
        if (totalAmount < settings.deposit_min_amount) throw new BadRequestException("amount should be greater than min amount")
        
        const rate = settings.alt_usdt_rate
        const total_deposit_amount_usdt = totalAmount / 10**TRON_USDT_DECIMALS
        const deposit_amount_usdt = total_deposit_amount_usdt - settings.deposit_fee_usdt
        const deposit_amount_alt = deposit_amount_usdt / rate
        
        let gasFreeTxExecuted = false;

        for (let i = 0; i < 5; i++) {
            try {
                const fee = user.wallet.isActivated ? MAX_FEE_IS_ACTIVATED : MAX_FEE_NOT_ACTIVED
                const value = totalAmount - fee
                const gasfreeTx = await this.executeGasfreeTransaction(user, value.toString(), fee.toString())
                
                gasFreeTxExecuted = true;
                break
            } catch (e) {
                console.log(e)
                await new Promise(r => setTimeout(r, 5_000))
            }
        }

         const [txRes, walletRes] = await this.prisma.$transaction([
            this.prisma.transaction.create({
                data: {
                    status: TransactionStatus.COMPLETED,
                    type: TransactionType.DEPOSIT,
                    hash: txHash,
                    alt_usdt_rate: settings.alt_usdt_rate,
                    from_token: TransactionToken.USDT,
                    from_amount: deposit_amount_usdt,
                    to_token: TransactionToken.ALT,
                    to_amount: deposit_amount_alt,
                    walletId: user.wallet.id,
                }
            }),
            this.prisma.wallet.update({
                where: { id: user.wallet.id },
                data: {
                    ...(!user.wallet.isActivated && gasFreeTxExecuted) ? {
                        isActivated: true
                    } : {},
                    alt_balance: {
                        increment: deposit_amount_alt
                    }
                }
            })
        ])


        if (user?.referrerId) await this.addDepositBonus(user.referrerId, settings.ref_lvl1_bonus_deposit_percent, deposit_amount_usdt, deposit_amount_alt, txHash, settings.alt_usdt_rate)
            // for (let lvl = 1; lvl <= 1; lvl++) {
            //     const referrerPrev = referrerUserByLevel[lvl - 1]

            //     if (!user?.referrerId) break
            //     if (lvl > 1 && !referrerPrev?.referrerId) break

            //     const referrer = await this.prisma.user.findUnique({ 
            //         where: { id: lvl == 1 ? user.referrerId : referrerPrev.referrerId!! }, 
            //         include: { wallet: true }
            //     })

            //     if (!referrer) break

            //     referrerUserByLevel[lvl] = referrer

            //     if (!(referrer && referrer?.wallet)) continue

            //     const refWallet = await this.prisma.wallet.findUnique({ where: { id: referrer.wallet.id } })

            //     if (!refWallet) continue

            //     const refPercent = settings.ref_lvl1_bonus_percent / 100
            //     const usdtAmountRef = refPercent * deposit_amount_usdt
            //     const altAmountRef = refPercent * deposit_amount_alt

            //     await this.prisma.$transaction([
            //         this.prisma.wallet.update({
            //             where: { id: refWallet.id },
            //             data: { 
            //                 alt_balance: {
            //                     increment: altAmountRef
            //                 }
            //             }
            //         }),
            //         this.prisma.transaction.create({
            //             data: {
            //                 status: TransactionStatus.COMPLETED,
            //                 type: TransactionType.BONUS,
            //                 hash: txHash,
            //                 ref_lvl: lvl,
            //                 alt_usdt_rate: settings.alt_usdt_rate,
            //                 from_token: TransactionToken.USDT,
            //                 from_amount: usdtAmountRef,
            //                 to_token: TransactionToken.ALT,
            //                 to_amount: altAmountRef,
            //                 walletId: refWallet.id,
            //             }
            //         })
            //     ])
            // }

        console.log('Deposit successfully completed')

        return {
            transaction: this.transformTransaction(txRes),
            status: 'ok',
            signature: txHash,
            alt_amount: deposit_amount_alt,
            usdt_amount: deposit_amount_usdt,
        }
    }

    async reinvest(tgId: string, alb_alt_rate: number, amount: number): Promise<ReinvestResponse> {
        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")

        const totalBalance = user.wallet.alt_dividends + user.wallet.alt_balance

        if (totalBalance <= 0) throw new BadRequestException("no balance")
        if (amount > totalBalance) throw new BadRequestException("wrong amount")
        
        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new BadRequestException("settings not found")

        const rate = settings.alb_alt_rate

        if (rate != alb_alt_rate) throw new BadRequestException("rate was changed")

        const alb_amount = amount / rate

        const isTakeFromBalance = user.wallet.alt_dividends < amount
        const takeFromBalance = amount - user.wallet.alt_dividends
        const taked_alt_from_dividends = isTakeFromBalance ? user.wallet.alt_dividends : amount

        const [walletRes, txRes] = await this.prisma.$transaction([ 
            this.prisma.wallet.update({ 
                where: { id: user.wallet.id },
                data: {
                    alt_dividends: {
                        decrement: taked_alt_from_dividends
                    },
                    ...isTakeFromBalance ? {
                        alt_balance: {
                            decrement: takeFromBalance
                        }
                    } : {},
                    locked_alb_balance: {
                        increment: alb_amount
                    }
                } 
            }),
            this.prisma.transaction.create({
                data: {
                    status: TransactionStatus.FROZEN,
                    type: TransactionType.REINVEST,
                    isLocked: true,
                    lockedUntil: new Date(Date.now() + settings.reinvest_cooldown_days * 24 * 60 * 60 * 1000),
                    alb_alt_rate: rate,
                    from_token: TransactionToken.ALT,
                    from_amount: amount,
                    to_token: TransactionToken.ALB,
                    to_amount: alb_amount,
                    walletId: user.wallet.id,
                }
            })
        ])

        return {
            transaction: this.transformTransaction(txRes),
            status: 'ok',
            amount: alb_amount
        }
    }

    async withdraw(tgId: string, amount: number, alt_usdt_rate: number): Promise<WithdrawResponse> {
        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")

        const totalBalance = user.wallet.alt_balance + user.wallet.alt_dividends

        if ((amount <= 0) || (amount > totalBalance)) throw new BadRequestException("wrong amount")
        
        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new BadRequestException("settings not found")

        const rate = settings.alt_usdt_rate

        if (alt_usdt_rate != rate) throw new BadRequestException("rate was changed")

        const fee = settings.withdraw_fee_usdt

        const isTakeFromDividends = user.wallet.alt_balance < amount
        const takeFromDividends = amount - user.wallet.alt_balance

        const totalAmountUSDT = amount * rate

        const taked_alt_from_balance = isTakeFromDividends ? user.wallet.alt_balance : amount

        const [_, transaction] = await this.prisma.$transaction([
            this.prisma.wallet.update({
                where: { id: user.wallet.id },
                data: {
                    alt_balance: {
                        decrement: taked_alt_from_balance
                    },
                    ...isTakeFromDividends ? {
                        alt_dividends: {
                            decrement: takeFromDividends
                        }
                    } : {}
                }
            }),
            this.prisma.transaction.create({
                data: {
                    status: TransactionStatus.PENDING,
                    type: TransactionType.WITHDRAW,
                    // isLocked: true,
                    // lockedUntil: new Date(Date.now() + settings.usdt_withdraw_cooldown_days * 24 * 60 * 60 * 1000),
                    alb_alt_rate: rate,
                    from_token: TransactionToken.ALT,
                    from_amount: amount,
                    to_token: TransactionToken.USDT,
                    feeUsdt: fee,
                    to_amount: totalAmountUSDT,
                    walletId: user.wallet.id,
                }
            })
        ])

        return {
            transaction: this.transformTransaction(transaction),
            alt_amount: taked_alt_from_balance,
            alt_dividends: takeFromDividends,
            isTakeFromDividends,
            usdt_amount: totalAmountUSDT
        }
    }
}