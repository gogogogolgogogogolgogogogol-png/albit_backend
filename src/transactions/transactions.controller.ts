import { Body, Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import { DepositRequest, ReinvestRequest, SwapRequest, WithdrawRequest } from "./transactions.dto";
import { TransactionsService } from "./transactions.service";
import { Request, Response } from "express"
import { TransactionType } from "@prisma/client";

@Controller("transactions")
export class TransactionsController {
    constructor(
        private readonly transactionsService: TransactionsService
    ) {}

    @Get("history")
    async history(@Res() res: Response, @Req() req: Request, @Query("offset") offset: number, @Query("limit") limit: number, @Query("sortType") sortType: "desc" | "asc" = "desc", @Query("transactionType") transactionType?: TransactionType) {
        const historyRes = await this.transactionsService.history(req['user']['tgId'], offset, limit, sortType, transactionType)

        return res.status(200).json(historyRes)
    }

    @Post("swap")
    async swap(@Res() res: Response, @Req() req: Request, @Body() dto: SwapRequest) {
        const swapRes = await this.transactionsService.swap(req['user']['tgId'], dto)

        res.status(200).json(swapRes)
    }

    @Post("deposit")
    async deposit(@Req() req: Request, @Res() res: Response, @Body() dto: DepositRequest) {
        const depositRes = await this.transactionsService.deposit(req['user']['tgId'], dto.hash)

        return res.status(200).json(depositRes)
    }

    @Post("reinvest")
    async reinvest(@Req() req: Request, @Res() res: Response, @Body() dto: ReinvestRequest) {
        const reinvestRes = await this.transactionsService.reinvest(req['user']['tgId'], dto.alb_alt_rate, dto.amount)

        return res.status(200).json(reinvestRes)
    }

    @Post("withdraw")
    async withdraw(@Req() req: Request, @Res() res: Response, @Body() dto: WithdrawRequest) {
        const withdrawRes = await this.transactionsService.withdraw(req['user']['tgId'], dto.amount, dto.alt_usdt_rate)

        return res.status(200).json(withdrawRes)
    }
}