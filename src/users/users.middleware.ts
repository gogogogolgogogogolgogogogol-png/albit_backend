import { Injectable, NestMiddleware } from "@nestjs/common";
import { setInitData } from "src/utils/tg.utils";
import { parse, validate } from '@tma.js/init-data-node';

@Injectable()
export class UsersMiddleware implements NestMiddleware {
    use(req: any, res: any, next: (error?: any) => void) {
        try {
          const token = "5002679940:AAGUeicXiUlzIu4hozKTzgBgF7P66R9dbFg"
          const [authType, authData = ''] = (req.header('authorization') || '').split(' ');

          console.log("auth type", authType)
        switch (authType) {
          case "tma": {
            validate(authData, token, {
              expiresIn: 3600,
            });

            setInitData(res, parse(authData));

            break
          }
          case "Bearer": {
            
          }
        }
        
        return next();
      } catch (e) {
        return next(e);
      }
    }
}