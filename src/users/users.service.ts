import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from 'nestjs-prisma';
import { ChangeLangResponse, ChangeWithdrawAddressRequest, ChangeWithdrawAddressResponse, GetMeResponse } from "./users.dto";
import { Lang, TransactionType } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { isValidTronAddress } from "src/utils/trx.utils";

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService
    ) {}

    async changeLang(tgId: string, lang: Lang): Promise<ChangeLangResponse> {
      if (!Object.keys(Lang).includes(lang)) throw new BadRequestException("lang not found")

      const user = await this.prisma.user.findUnique({ where: { tgId } })
      if (!user) throw new BadRequestException("user not found")
      
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

    async changeWithdrawAddress(tgId: string, address: string): Promise<ChangeWithdrawAddressResponse> {
      const user = await this.prisma.user.findUnique({ where: { tgId }, include: { wallet: true } })
      if (!(user && user?.wallet)) throw new BadRequestException("user not found")
      
      const isValid = isValidTronAddress(address)

      if (!isValid) throw new BadRequestException("is not valid address")

      await this.prisma.wallet.update({
        where: { id: user.wallet.id },
        data: { withdrawAddress: address }
      })

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

            if (referrals.length === 0) break;

            totalCount += referrals.length;
            currentLevelIds = referrals.map(r => {
                if (r.wallet?.transactions?.find(e => e.type == TransactionType.DEPOSIT)) {
                    totalActiveCount++
                    totalCountByLVL[level] += 1
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

    async getMe(tgId: string): Promise<GetMeResponse> {
      const user = await this.prisma.user.findUnique({
        where: { tgId },
        include: { wallet: true },
      });

      if (!(user && user?.wallet)) throw new BadRequestException("user not found");

      const botLink = this.config.get("REFERRAL_BOT_LINK");
      if (!botLink) throw new BadRequestException("bot link not found");

      const [
        settings,
        transactions,
        earnedAllAlt,
        earnedWeekAlt,
        totalReferralsBonuses,
        countAllReferrals,
        bonusesByLevel,
      ] = await Promise.all([
        this.prisma.settings.findFirst(),

        this.prisma.transaction.findMany({
          where: { walletId: user.wallet.id },
          take: 10,
          orderBy: { createdAt: "desc" },
        }),

        this.prisma.transaction.aggregate({
          where: {
            walletId: user.wallet.id,
            type: TransactionType.DIVIDENDS,
          },
          _sum: { to_amount: true },
        }),

        this.prisma.transaction.aggregate({
          where: {
            walletId: user.wallet.id,
            type: TransactionType.DIVIDENDS,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          _sum: { to_amount: true },
        }),

        this.prisma.transaction.aggregate({
          where: {
            walletId: user.wallet.id,
            type: TransactionType.BONUS,
          },
          _sum: { to_amount: true },
        }),

        this.countAllReferrals(user.id),

        Promise.all(
          [1, 2, 3, 4, 5].map((lvl) =>
            this.prisma.transaction.aggregate({
              where: {
                walletId: user.wallet!!.id,
                type: TransactionType.BONUS,
                ref_lvl: lvl,
              },
              _sum: { to_amount: true },
            })
          )
        ),
      ]);

      if (!settings) throw new BadRequestException("settings not found");

      return {
        balances: {
          alt_balance: user.wallet.alt_balance,
          alb_balance: user.wallet.alb_balance,
          alt_in_usd_balance: settings.alt_usdt_rate * user.wallet.alt_balance,
        },
        history_all: transactions,
        withdraw_address: user.wallet.withdrawAddress,
        deposit_address: user.wallet.depositAddress || "",
        earned: {
          performance: settings.daily_income_alb_percent,
          all_amount_alt: earnedAllAlt._sum.to_amount || 0,
          week_amount_alt: earnedWeekAlt._sum.to_amount || 0,
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
        referrals: {
          count: countAllReferrals.total_count,
          active: countAllReferrals.active_count,
          totalBonuses: totalReferralsBonuses._sum.to_amount || 0,
          link: botLink + user.tgId,
          lvl1: {
            percent: settings.ref_lvl1_bonus_percent,
            count: countAllReferrals.totalCountByLVL[1],
            totalBonuses: bonusesByLevel[0]._sum.to_amount || 0,
          },
          lvl2: {
            percent: settings.ref_lvl2_bonus_percent,
            count: countAllReferrals.totalCountByLVL[2],
            totalBonuses: bonusesByLevel[1]._sum.to_amount || 0,
          },
          lvl3: {
            percent: settings.ref_lvl3_bonus_percent,
            count: countAllReferrals.totalCountByLVL[3],
            totalBonuses: bonusesByLevel[2]._sum.to_amount || 0,
          },
          lvl4: {
            percent: settings.ref_lvl4_bonus_percent,
            count: countAllReferrals.totalCountByLVL[4],
            totalBonuses: bonusesByLevel[3]._sum.to_amount || 0,
          },
          lvl5: {
            percent: settings.ref_lvl5_bonus_percent,
            count: countAllReferrals.totalCountByLVL[5],
            totalBonuses: bonusesByLevel[4]._sum.to_amount || 0,
          },
        },
      }
    }
}