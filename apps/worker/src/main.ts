import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './bootstrap/worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Close the context (and run shutdown hooks) on SIGINT/SIGTERM.
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  new Logger('WorkerBootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
