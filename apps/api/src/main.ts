import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';

import { createApiApplication } from './bootstrap/api-application';
import { loadAppConfig } from './config/app-config';
import { buildOpenApiDocument } from './openapi/build-openapi-document';

/** Swagger UI mounts under the global prefix, matching the gateway: /api/docs. */
const DOCS_ROUTE = 'docs';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadAppConfig(process.env);

  const app = await createApiApplication();
  app.enableShutdownHooks();

  if (config.docsEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup(DOCS_ROUTE, app, document, { useGlobalPrefix: true });
    logger.log(`OpenAPI docs enabled at /api/${DOCS_ROUTE}`);
  }

  await app.listen(config.port);
  logger.log(`API listening on port ${config.port} (${config.environment})`);
}

bootstrap().catch((error: unknown) => {
  // Startup failures must be visible and terminate the process.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
