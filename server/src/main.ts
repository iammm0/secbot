import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { applyBundledToolsPath } from './modules/tools/control/bundled-tools-path';

async function bootstrap() {
  const toolsDirs = applyBundledToolsPath();
  if (toolsDirs.length > 0) {
    console.log(`[secbot] bundled tools PATH: ${toolsDirs.join(', ')}`);
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = process.env.PORT ? Number(process.env.PORT) : 8000;
  await app.listen(port);
  console.log(`Secbot backend listening on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap NestJS application', error);
  process.exit(1);
});
