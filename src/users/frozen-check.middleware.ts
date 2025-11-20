import { Injectable, NestMiddleware, ForbiddenException } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { PrismaService } from "nestjs-prisma";

@Injectable()
export class FrozenCheckMiddleware implements NestMiddleware {
    constructor(private readonly prisma: PrismaService) {}

    async use(req: Request, res: Response, next: NextFunction) {
        try {
            const publicRoutes = ['/users/register'];
            if (publicRoutes.some(route => req.path.includes(route))) {
                return next();
            }

            const user = req['user'];
            if (!user || !user.tgId) {
                return next();
            }

            const dbUser = await this.prisma.user.findUnique({
                where: { tgId: user.tgId },
                select: { isFrozen: true }
            });

            if (!dbUser || !dbUser.isFrozen) {
                return next();
            }

            if (req.method === 'GET' && req.path === '/users/me') {
                return next();
            }

            throw new ForbiddenException('account is frozen');
        } catch (error) {
            if (error instanceof ForbiddenException) {
                throw error;
            }
            return next(error);
        }
    }
}

