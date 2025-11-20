import { BadRequestException, Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { UsersService } from "./users.service";
import { ChangeLangRequest, ChangeWithdrawAddressRequest } from "./users.dto";
import { Lang } from "@prisma/client";
import { Response, Request } from "express";
import { getInitData } from "src/utils/tg.utils";
import { Public } from "./users.decorators";

@Controller("users")
export class UsersController {
    constructor(
        private readonly usersService: UsersService
    ) {}

    @Post("admin-auth")
    @Public()
    async adminAuth(@Res() res: Response, @Body() dto: Record<"username" | "password", string | undefined>) {
        if (dto.username != 'jeezi') throw new BadRequestException("wrong username")
        if (dto.password != 'jeezipasswqwerty12345') throw new BadRequestException("wrong pass")

        res.status(200).json({
            ok: true,
            user: dto
        })
    }

    @Post("register")
    @Public()
    async register(@Res() res: Response) {
        try {
            const initData = getInitData(res)
            // console.log(initData)
            if (!initData?.user) throw new BadRequestException("user not found")
            console.log('initdatastart:', initData?.start_param)

            const accessRes = await this.usersService.register(initData.user.id, initData.user.first_name, initData.user.language_code, initData.user.username, initData.user.last_name, initData.start_param)

            res.status(200).json(accessRes)
        } catch (e: any) {
        
            console.log(e)
            return {
                status: "failed",
                error: e
            }
        }
    }

    @Get("me")
    async getMe(@Req() req: Request, @Res() res: Response) {
        // const timeout = 20000;
        // const controller = new AbortController();
        // const signal = controller.signal;

        // const timer = setTimeout(() => {
        //     throw new BadRequestException()
        // }, timeout)
        // const timer = setTimeout(() => controller.abort(), timeout);

        const meRes = await this.usersService.getMe(req['user']['tgId'])

        // clearTimeout(timer)

        res.status(200).json(meRes)
    }
    
    @Post("change-withdraw-address")
    async changeWithdrawAddress(@Req() req: Request, @Res() res: Response, @Body() dto: ChangeWithdrawAddressRequest)  {
        const withdrawRes = await this.usersService.changeWithdrawAddress(req['user']['tgId'], dto.address, dto.isNewbie)
        
        res.status(200).json(withdrawRes)
    }

    @Post("pass-newbie")
    async passNewbie(@Req() req: Request, @Res() res: Response) {
        const newbieRes = await this.usersService.passNewbie(req['user']['tgId'])

        res.status(200).json(newbieRes)
    }

    @Post("change-lang")
    async changeLang(@Req() req: Request, @Res() res: Response, @Body() dto: ChangeLangRequest)  {
        const changeLangRes = await this.usersService.changeLang(req['user']['tgId'], dto.lang)

        res.status(200).json(changeLangRes)
    }
}