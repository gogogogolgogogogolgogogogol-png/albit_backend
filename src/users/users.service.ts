import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from 'nestjs-prisma';
import { ChangeLangResponse, ChangeWithdrawAddressRequest, ChangeWithdrawAddressResponse, GetMeResponse, RegisterResponse } from "./users.dto";
import { Lang, TransactionType } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { generateGasRequest, generateTronWallet, isValidTronAddress } from "src/utils/trx.utils";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly jwtService: JwtService
    ) {}

    async register(tgUserId: number, firstName: string, langCode?: string, username?: string, lastName?: string, refTgId?: string): Promise<RegisterResponse> {
      console.log(tgUserId.toString())
      const existsUser = await this.prisma.user.findUnique({ where: { tgId: tgUserId.toString() } })
      console.log(existsUser)
      if (existsUser) {
        // return tokens
        const payload = {
          sub: existsUser.id,
          tgId: existsUser.tgId
        }

        const accessToken = await this.jwtService.signAsync(payload)

        return {
          accessToken
        }
      }

      let referrerId: number | null = null
      if (refTgId) {
        const referrer = await this.prisma.user.findUnique({ where: { tgId: refTgId } })
        if (referrer) referrerId = referrer.id
      }

      const tronWallet = await generateTronWallet()

      const pathFetchAddress = `/tron/api/v1/address/${tronWallet.publicKey}`
      const respFetchAddress = await generateGasRequest(pathFetchAddress, "GET")

      const gasFreeAddress = respFetchAddress.data.gasFreeAddress

      const user = await this.prisma.user.create({
        data: {
          tgId: tgUserId.toString(),
          ...langCode ? { lang: Lang[langCode.toUpperCase()] } : {},
          username,
          firstName,
          lastName,
          ...referrerId != null ? { referrerId } : {},
          wallet: {
            create: {
              address: tronWallet.publicKey,
              privateKey: tronWallet.privateKey,
              gasFreeAddress,
            }
          }
        }
      })

      const payload = {
        sub: user.id,
        tgId: user.tgId
      }

      const accessToken = await this.jwtService.signAsync(payload)

      return {
        accessToken
      }
    }

    async changeLang(tgId: string, lang: Lang): Promise<ChangeLangResponse> {
      if (!Object.keys(Lang).includes(lang)) throw new BadRequestException("lang not found")

      const user = await this.prisma.user.findUnique({ where: { tgId } })
      if (!user) throw new UnauthorizedException("user not found")
      
      await this.prisma.user.update({ where: { id: user.id }, data: { lang } })

      return {
        status: "ok",
        response: {
          data: {
            lang
          }
        }
      }
    }

    async passNewbie(tgId: string) {
      const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
      if (!(user && user?.wallet)) throw new BadRequestException("user not found")
      
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isNewbie: false
        }
      })

      return {
        status: "ok"
      }
    }

    async changeWithdrawAddress(tgId: string, address: string, isNewbie?: boolean): Promise<ChangeWithdrawAddressResponse> {
      const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
      if (!(user && user?.wallet)) throw new UnauthorizedException("user not found")
      
      const isValid = isValidTronAddress(address)

      if (!isValid) throw new BadRequestException("is not valid address")

      await this.prisma.wallet.update({
        where: { id: user.wallet.id },
        data: { 
          withdrawAddress: address,
        }
      })

      if (isNewbie) {
        await this.prisma.user.update({
          where: {
            id: user.id
          },
          data: {
            isNewbie: false
          }
        })
      }

      return {
        status: "ok",
        response: {
          data: {
            address,
          }
        }
      }
    }

    private async countAllReferrals(userId: number, maxLevel = 5): Promise<{ 
        total_count: number, 
        active_count: number, 
        totalCountByLVL: Record<number, number>
    }> {
        let totalCount = 0;
        let totalActiveCount = 0;
        let totalCountByLVL: Record<number, number> = {}
        let currentLevelIds = [userId];

        for (let level = 1; level <= maxLevel; level++) {
            const referrals = await this.prisma.user.findMany({
                where: {
                    referrerId: { in: currentLevelIds },
                },
                select: { id: true, wallet: { select: { transactions: true } } },
            });

            console.log(referrals)

            if (referrals.length === 0) break;

            totalCount += referrals.length;
            currentLevelIds = referrals.map(r => {
                if (r.wallet?.transactions?.find(e => e.type == TransactionType.DEPOSIT)) {
                    totalActiveCount++
                    if (isNaN(totalCountByLVL[level])) {
                      totalCountByLVL[level] = 1
                    } else {
                      totalCountByLVL[level] += 1
                    }
                    console.log('level', level)
                    console.log('totlaCount', totalCountByLVL[level])
                }
                return r.id
            });
        }

        return {
            total_count: totalCount,
            active_count: totalActiveCount,
            totalCountByLVL
        };
    }

    async  getMe(tgId: string): Promise<GetMeResponse> {
      console.log('getme', tgId)
  const user = await this.prisma.user.findUnique({
    where: { tgId },
    select: {
      id: true,
      tgId: true,
      lang: true,
      username: true,
      firstName: true,
      isNewbie: true,
      isFrozen: true,
      lastName: true,
      wallet: {
        select: {
          id: true,
          alt_balance: true,
          locked_alb_balance: true,
          locked_alt_balance: true,
          gasFreeAddress: true,
          alb_balance: true,
          alt_dividends: true,
          withdrawAddress: true,
          address: true,
        },
      },
    },
  });

  if (!user || !user.wallet) throw new UnauthorizedException("user not found");

  const botLink = this.config.get("REFERRAL_BOT_LINK");
  if (!botLink) throw new BadRequestException("bot link not found");

  const weekDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [settings, 
    // transactions, 
    dividendsAll, dividendsWeek, bonusAll, bonusesByLevel, referralsCounts] = 
    await Promise.all([
      this.prisma.settings.findFirst(),
      // this.prisma.transaction.findMany({
      //   where: { walletId: user.wallet.id },
      //   take: 10,
      //   orderBy: { createdAt: 'desc' },
      // }),
      this.prisma.transaction.aggregate({
        where: { walletId: user.wallet.id, type: TransactionType.DIVIDENDS },
        _sum: { to_amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          walletId: user.wallet.id,
          type: TransactionType.DIVIDENDS,
          createdAt: { gte: weekDate },
        },
        _sum: { to_amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { walletId: user.wallet.id, type: TransactionType.BONUS },
        _sum: { to_amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['ref_lvl'],
        where: { walletId: user.wallet.id, type: TransactionType.BONUS },
        _sum: { to_amount: true },
      }),
      this.countAllReferrals(user.id),
    ]);

    console.log(dividendsAll, dividendsWeek)

  if (!settings) throw new BadRequestException("settings not found");

  const bonusesMap = new Map<number, number>();
  bonusesByLevel.forEach(b => bonusesMap.set(b.ref_lvl!!, b._sum.to_amount ?? 0));

  const altInUsdBalance = settings.alt_usdt_rate * user.wallet.alt_balance
  const altDividendsUsdBalance = settings.alt_usdt_rate * user.wallet.alt_dividends
  const albUsdBalance = settings.alb_alt_rate * user.wallet.alb_balance * settings.alt_usdt_rate

  const usdBalance = altInUsdBalance + altDividendsUsdBalance + albUsdBalance

  return {
    fees: {
      withdraw: settings.withdraw_fee_usdt,
      deposit: settings.deposit_fee_usdt
    },
    isNewbie: user.isNewbie,
    isFrozen: user.isFrozen,
    username: user.username || undefined,
    firstName: user.firstName,
    lastName: user.lastName || undefined,
    balances: {
      alt_balance: user.wallet.alt_balance,
      locked_alt_balance: user.wallet.locked_alt_balance,
      alb_balance: user.wallet.alb_balance,
      locked_alb_balance: user.wallet.locked_alb_balance,
      alt_dividends: user.wallet.alt_dividends,
      alt_in_usd_balance: usdBalance,
    },
    history_transactions: [],
    withdraw_address: user.wallet.withdrawAddress || '',
    deposit_address: user.wallet.gasFreeAddress || '',
    earned: {
      performance: settings.daily_income_alb_percent,
      all_amount_alt: dividendsAll._sum.to_amount ?? 0,
      week_amount_alt: dividendsWeek._sum.to_amount ?? 0,
    },
    rates: {
      alb_alt_rate: settings.alb_alt_rate,
      alt_usdt_rate: settings.alt_usdt_rate,
    },
    minimal_amounts: {
      deposit: settings.deposit_min_amount,
      withdraw: settings.withdraw_min_amount,
      alb_alt_min_amount: settings.min_swap_alb_amount,
      alt_alb_min_amount: settings.min_swap_alt_amount,
    },
    lang: user.lang,
    cooldowns_days: {
      reinvest: settings.reinvest_cooldown_days,
      alt_alb_swap: settings.alt_alb_cooldown_days,
      withdraw: settings.usdt_withdraw_cooldown_days
    },
    referrals: {
      bonus_percent: settings.ref_lvl1_bonus_deposit_percent,
      count: referralsCounts.total_count,
      active: referralsCounts.active_count,
      totalBonuses: bonusAll._sum.to_amount ?? 0,
      link: botLink + user.tgId,
      lvl1: { percent: settings.ref_lvl1_bonus_percent, count: referralsCounts.totalCountByLVL[1] || 0, totalBonuses: bonusesMap.get(1) ?? 0, minAmountAlb: settings.ref_lvl1_bonus_min_alb },
      lvl2: { percent: settings.ref_lvl2_bonus_percent, count: referralsCounts.totalCountByLVL[2] || 0, totalBonuses: bonusesMap.get(2) ?? 0, minAmountAlb: settings.ref_lvl2_bonus_min_alb },
      lvl3: { percent: settings.ref_lvl3_bonus_percent, count: referralsCounts.totalCountByLVL[3] || 0, totalBonuses: bonusesMap.get(3) ?? 0, minAmountAlb: settings.ref_lvl3_bonus_min_alb },
      lvl4: { percent: settings.ref_lvl4_bonus_percent, count: referralsCounts.totalCountByLVL[4] || 0, totalBonuses: bonusesMap.get(4) ?? 0, minAmountAlb: settings.ref_lvl4_bonus_min_alb },
      lvl5: { percent: settings.ref_lvl5_bonus_percent, count: referralsCounts.totalCountByLVL[5] || 0, totalBonuses: bonusesMap.get(5) ?? 0, minAmountAlb: settings.ref_lvl5_bonus_min_alb },
    },
  };
}
}