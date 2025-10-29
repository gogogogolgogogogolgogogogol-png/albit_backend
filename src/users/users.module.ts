import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { JwtModule } from "@nestjs/jwt";

@Module({
    imports: [
        JwtModule.register({
            global: true,
            secret: process.env.JWT_SECRET,
            signOptions: {
                expiresIn: '30d'
            }
        })
    ],
    controllers: [
        UsersController
    ],
    providers: [
        UsersService
    ]
})
export class UsersModule {}
