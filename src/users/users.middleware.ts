import { Injectable, NestMiddleware } from "@nestjs/common";
import { setInitData } from "src/utils/tg.utils";
import { parse, validate } from '@tma.js/init-data-node';

@Injectable()
export class UserMiddleware implements NestMiddleware {
    use(req: any, res: any, next: (error?: any) => void) {
        try {
          const token = "BOT_TOKEN"
          const [authType, authData = ''] = (req.header('authorization') || '').split(' ');

        // Validate init data.
        validate(authData, token, {
          // We consider init data sign valid for 1 hour from their creation moment.
          expiresIn: 3600,
        });

        // Parse init data. We will surely need it in the future.
        setInitData(res, parse(authData));
        return next();
      } catch (e) {
        return next(e);
      }
    }
}