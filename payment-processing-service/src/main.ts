import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  // Global validation pipe — validate all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Strip unknown properties
      forbidNonWhitelisted: true, // Reject unknown properties
      transform: true,            // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.enableCors();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port');

  await app.listen(port);
  logger.log(`Payment Processing Service running on port ${port}`, 'Bootstrap');
  logger.log(`Environment: ${configService.get('nodeEnv')}`, 'Bootstrap');
}

bootstrap();
