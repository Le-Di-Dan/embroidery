import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { createApiApplication } from '../../bootstrap/api-application';
import { buildOpenApiDocument, describeDocument } from '../build-openapi-document';
import { ensureGenerationEnvironment } from '../generation-environment';
import { resolveArtifactPath } from '../openapi-artifact';
import { serializeOpenApiDocument } from '../serialize-openapi-document';

/**
 * Writes the canonical OpenAPI artifact (APP0-B01). Creates the application
 * without listening on a port, builds and serializes the document, writes it to
 * the contract package, and always closes the application so the process exits.
 */
async function generate(): Promise<void> {
  ensureGenerationEnvironment();
  const app = await createApiApplication({ logger: false });
  try {
    const document = buildOpenApiDocument(app);
    const serialized = serializeOpenApiDocument(document);
    const artifactPath = resolveArtifactPath(__dirname);

    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, serialized, 'utf8');

    const stats = describeDocument(document);
    process.stdout.write(
      [
        `OpenAPI artifact written: ${artifactPath}`,
        `  paths:      ${stats.pathCount}`,
        `  operations: ${stats.operationCount}`,
        `  schemas:    ${stats.schemaCount}`,
        '',
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

generate().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
