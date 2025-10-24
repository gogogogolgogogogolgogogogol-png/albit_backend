import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    const settings = await this.prisma.settings.findFirst()
    if (!settings) await this.prisma.settings.create({
      data: {}
    })
  }

  getHello(): string {
    return 'Hello World!';
  }
}
