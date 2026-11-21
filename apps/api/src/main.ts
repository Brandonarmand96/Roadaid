import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { jsonBigIntReplacer } from './common/utils/json-bigint';

dotenv.config();

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Validate environment config
  const env = validateEnv(process.env);
  logger.log(`Starting RoadAid API in ${env.NODE_ENV} mode on port ${env.PORT}...`);

  const allowedOrigins = env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  const app = await NestFactory.create(AppModule, {
    cors: env.NODE_ENV === 'production' || (env.NODE_ENV === 'test' && allowedOrigins.length > 0)
      ? {
          origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Origin is not allowed by RoadAid CORS policy'), false);
          },
          credentials: true,
        }
      : true,
    rawBody: true,
  });

  // Prisma returns PostgreSQL BIGINT columns as bigint. JSON has no bigint
  // primitive, while the public API contract requires exact integer kobo.
  app.getHttpAdapter().getInstance().set('json replacer', jsonBigIntReplacer);

  // Security headers
  app.use(helmet());

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global prefix /v1 (excluding health endpoints if needed, but we provide health on /v1/health and /health)
  app.setGlobalPrefix('v1', {
    exclude: ['health', 'ready'],
  });

  // Swagger OpenAPI documentation
  if (env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('RoadAid API')
      .setDescription('RoadAid On-demand roadside assistance API for Abuja, Nigeria')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`RoadAid API running at http://localhost:${env.PORT}`);
  if (env.NODE_ENV === 'development') logger.log(`API Documentation available at http://localhost:${env.PORT}/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
