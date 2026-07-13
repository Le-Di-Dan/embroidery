import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './bootstrap/app.module';
import { loadAppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadAppConfig(process.env);

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`API listening on port ${config.port} (${config.environment})`);
}

bootstrap().catch((error: unknown) => {
  // Startup failures must be visible and terminate the process.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
