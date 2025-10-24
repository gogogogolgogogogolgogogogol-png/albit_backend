import { Body, Controller, Post } from "@nestjs/common";
import { DepositRequest, SwapRequest } from "./transactions.dto";
import { TransactionsService } from "./transactions.service";

@Controller("transactions")
export class TransactionsController {
    constructor(
        private readonly transactionsService: TransactionsService
    ) {}

    @Post("swap")
    async swap(@Body() dto: SwapRequest) {
        try {
            const tgId = "0"
            const res = await this.transactionsService.swap(tgId, dto)

            return res
        } catch (e: any) {
            console.log(e)
            return {
                status: "failed",
                error: e
            }
        }
    }

    @Post("deposit")
    async deposit(@Body() dto: DepositRequest) {
        try {
            const tgId = "0"
            const res = await this.transactionsService.deposit(tgId, dto.txHash)

            return res
        } catch (e: any) {
            console.log(e)
            return {
                status: "failed",
                error: e
            }
        }
    }
}