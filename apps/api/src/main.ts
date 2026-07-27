import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';

import { createApiApplication } from './bootstrap/api-application';
import { startApi } from './bootstrap/start-api';
import { loadAppConfig } from './config/app-config';
import { ObjectStorageBootstrapService } from './modules/asset/infrastructure/storage/object-storage-bootstrap.service';
import { NestLoggerAdapter } from './platform/logging/nest-logger.adapter';
import { buildOpenApiDocument } from './openapi/build-openapi-document';

/** Swagger UI mounts under the global prefix, matching the gateway: /api/docs. */
const DOCS_ROUTE = 'docs';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig(process.env);

  const app = await createApiApplication();
  // Route Nest's own framework and lifecycle logs through the structured logger
  // (APP0-B05) so the process emits a single one-line JSON format everywhere.
  app.useLogger(app.get(NestLoggerAdapter));
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');

  if (config.docsEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup(DOCS_ROUTE, app, document, { useGlobalPrefix: true });
    logger.log(`OpenAPI docs enabled at /api/${DOCS_ROUTE}`);
  }

  // Private buckets are verified before the port opens (APP2-I03): an API that
  // accepts an upload it cannot store fails in front of a customer instead of
  // at startup, where an orchestrator can act on it.
  const listening = await startApi({
    bootstrapStorage: () => app.get(ObjectStorageBootstrapService).initialize(),
    listen: async () => {
      await app.listen(config.port);
    },
    close: () => app.close(),
    onError: (error: unknown) => {
      // Class only — the failure's own message names the class and nothing
      // else, and its `cause` is never formatted.
      logger.error(error instanceof Error ? error.message : String(error));
    },
  });

  if (!listening) {
    process.exitCode = 1;
    return;
  }

  logger.log(`API listening on port ${config.port} (${config.environment})`);
}

bootstrap().catch((error: unknown) => {
  // Startup failures must be visible and terminate the process.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
