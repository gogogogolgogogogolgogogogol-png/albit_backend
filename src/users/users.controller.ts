import { BadRequestException, Body, Controller, Get, Post, Res } from "@nestjs/common";
import { UsersService } from "./users.service";
import { ChangeLangRequest, ChangeWithdrawAddressRequest } from "./users.dto";
import { Lang } from "@prisma/client";
import { Response } from "express";
import { getInitData } from "src/utils/tg.utils";

@Controller("users")
export class UsersController {
    constructor(
        private readonly usersService: UsersService
    ) {}

    @Get("me")
    async getMe(@Res() res: Response) {
        const initData = getInitData(res)
        console.log(initData)
        try {
            const tgId = "0"
            const res = await this.usersService.getMe(tgId)

            return res
        } catch (e: any) {
            console.log(e)
            return {
                status: "failed",
                error: e
            }
        }
    }
    
    @Post("change-withdraw-address")
    async changeWithdrawAddress(@Body() dto: ChangeWithdrawAddressRequest)  {
        try {
            const tgId = "0"
            return this.usersService.changeWithdrawAddress(tgId, dto.address)
        } catch (e: any) {
            console.log(e)
            return {
                status: "failed",
                error: e
            }
        }
    }

    @Post("change-lang")
    async changeLang(@Body() dto: ChangeLangRequest)  {
        try {
            const tgId = "0"
            return this.usersService.changeLang(tgId, dto.lang)
        } catch (e: any) {
            console.log(e)
            return {
                status: "failed",
                error: e
            }
        }
    }
}