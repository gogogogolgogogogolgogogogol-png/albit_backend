import { Injectable, NestMiddleware } from "@nestjs/common";

@Injectable()
export class UserMiddleware implements NestMiddleware {
    use(req: any, res: any, next: (error?: any) => void) {
        try {
        // validate(authData, token, {
        //   expiresIn: 3600,
        // });

        // setInitData(res, parse(authData));
        return next();
      } catch (e) {
        return next(e);
      }
    }
}