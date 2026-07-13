import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './bootstrap/app.module';
import { loadAppConfig } from './config/app-config';

/**
 * Browser-visible API paths are /api/* behind the development gateway; the
 * gateway forwards them unchanged, so the API owns the same prefix (D-036).
 * Health lives under the prefix as GET /api/health.
 */
const GLOBAL_ROUTE_PREFIX = 'api';

/**
 * Trust exactly one proxy hop: in normal mode the API is reachable only
 * through the internal Nginx gateway, which sets X-Forwarded-* headers.
 * Assumption (documented in LOCAL_DEVELOPMENT.md): clients never reach the
 * API directly except via the loopback-only debug overlay, so a wider
 * trust setting is unnecessary and would be spoofable. This is a
 * development-topology value only — production trust-proxy configuration
 * must be re-decided with the Gateway API/controller topology.
 */
const TRUSTED_PROXY_HOPS = 1;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadAppConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`API listening on port ${config.port} (${config.environment})`);
}

bootstrap().catch((error: unknown) => {
  // Startup failures must be visible and terminate the process.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
