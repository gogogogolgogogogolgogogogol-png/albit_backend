import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { TRON_USDT_ADDRESS, TRON_USDT_DECIMALS, TronApi } from "src/utils/trx.utils";
import { SwapRequest } from "./transactions.dto";
import { TransactionToken, TransactionType } from "@prisma/client";
import { TronWeb } from "tronweb";

@Injectable()
export class TransactionsService implements OnModuleInit {
    constructor(
        private readonly prisma: PrismaService
    ) {}

    async onModuleInit() {
        this.deposit("0", "cd35051b28b4d4e2a1075277615df41f1c95f8835e7523dcd8894e5d9cf6f1fc").then(res => console.log(res))
    }

    async swap(tgId: string, dto: SwapRequest) {
        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")

        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new BadRequestException("settings not found")

        if ((dto.from.token == TransactionToken.ALT) && (dto.to.token == TransactionToken.ALB)) {
            if (dto.from.amount < settings.min_swap_alt_amount) throw new BadRequestException("less then min amount")

            // lock 3 days without dividends
            const alt_alb_rate = 1 / settings.alb_alt_rate
            const alb_amount = dto.from.amount * alt_alb_rate

            const amountWithLocked = user.wallet.alt_balance + user.wallet.locked_alt_balance
            const isEnough = user.wallet.alt_balance >= dto.from.amount
            const isEnoughWithLocked = amountWithLocked >= dto.from.amount

            if (settings.alb_alt_rate != dto.alb_usdt_rate) throw new BadRequestException("rate refresh")

            if (!isEnough && isEnoughWithLocked) {
                throw new BadRequestException("locked:" + amountWithLocked)
            } else if (!isEnough) {
                throw new BadRequestException("insufficient balance")
            }

            const [resWallet, resTx] = await this.prisma.$transaction([
                this.prisma.wallet.update({ where: { id: user.wallet.id }, data: {
                    alt_balance: {
                        decrement: dto.from.amount
                    },
                    locked_alb_balance: {
                        increment: alb_amount
                    }
                } }),
                this.prisma.transaction.create({
                    data: {
                        type: TransactionType.SWAP,
                        isLocked: true,
                        lockedUntil: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                        alb_alt_rate: settings.alb_alt_rate,
                        from_token: TransactionToken.ALT,
                        from_amount: dto.from.amount,
                        to_token: TransactionToken.ALB,
                        to_amount: alb_amount,
                        walletId: user.wallet.id,
                    }
                })
            ])
        } else if ((dto.from.token == TransactionToken.ALB) && (dto.to.token == TransactionToken.ALT)) {
            if (dto.from.amount <= settings.min_swap_alb_amount) throw new BadRequestException("less then min amount")

            const alb_alt_rate = settings.alb_alt_rate
            const alt_amount = dto.from.amount * alb_alt_rate

            const amountWithLocked = user.wallet.alb_balance + user.wallet.locked_alb_balance
            const isEnough = user.wallet.alb_balance >= dto.from.amount
            const isEnoughWithLocked = amountWithLocked >= dto.from.amount

            if (settings.alb_alt_rate != dto.alb_usdt_rate) throw new BadRequestException("rate refresh")

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
                    alt_balance: {
                        increment: alt_amount
                    }
                } }),
                this.prisma.transaction.create({
                    data: {
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
        } else {
            throw new BadRequestException("wrong tokens")
        }
    }

    async deposit(tgId: string, txHashWithSpaces: string) {
        const txHash = txHashWithSpaces.replaceAll(" ", "")

        const txExists = await this.prisma.transaction.findUnique({ where: { hash: txHash } })
        if (txExists) throw new BadRequestException("transaction exists")

        const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
        if (!(user && user?.wallet)) throw new BadRequestException("user not found")

        const settings = await this.prisma.settings.findFirst()
        if (!settings) throw new BadRequestException("settings not found")

        const txInfo = await TronApi.trx.getTransactionInfo(txHash)
        const txLogs = txInfo.log

        if (!txLogs.length) throw new BadRequestException("tx must have logs")

        let totalAmount = 0

        for (const txLog of txLogs) {
            const tokenAddress = TronWeb.address.fromHex(`41${txLog.address}`)
            const toAddress = TronWeb.address.fromHex(`41${txLog.topics[2].slice(-40)}`)

            console.log(tokenAddress, toAddress)
            if (tokenAddress != TRON_USDT_ADDRESS || toAddress != "TF18MQ4hzkAGb8DN7aTS6EGhu4k7TqkFAk") continue

            const amount = parseInt(txLog.data, 16)
            totalAmount += amount
        }
        

        if (totalAmount < settings.deposit_min_amount) throw new BadRequestException("amount should be greater than min amount")
        
        const rate = 1 / settings.alt_usdt_rate
        const deposit_amount_usdt = totalAmount / 10**TRON_USDT_DECIMALS
        const deposit_amount_alt = deposit_amount_usdt * rate

        const [txRes, walletRes] = await this.prisma.$transaction([
            this.prisma.transaction.create({
                data: {
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
                    alt_balance: {
                        increment: deposit_amount_alt
                    }
                }
            })
        ])

        //TODO
    }
}