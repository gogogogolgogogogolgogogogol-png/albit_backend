import { Module } from "@nestjs/common";
import { TransactionsController } from "./transactions.controller";
import { TransactionsService } from "./transactions.service";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
    imports: [
        ScheduleModule.forRoot()
    ],
    controllers: [
        TransactionsController
    ],
    providers: [
        TransactionsService
    ]
})
export class TransactionsModule {}