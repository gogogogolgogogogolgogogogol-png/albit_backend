import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersMiddleware } from './users/users.middleware';
import { AllExceptionsFilter } from './exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true
  })
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new AllExceptionsFilter())
  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();
