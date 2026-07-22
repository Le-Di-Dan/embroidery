import { createApiApplication } from '../../bootstrap/api-application';
import { buildOpenApiDocument } from '../build-openapi-document';
import { ensureGenerationEnvironment } from '../generation-environment';
import { compareArtifact, readCommittedArtifact, resolveArtifactPath } from '../openapi-artifact';
import { serializeOpenApiDocument } from '../serialize-openapi-document';

/**
 * Fails when the committed OpenAPI artifact is missing or out of date
 * (APP0-B01). Generates a candidate in memory and compares it against the
 * committed file; it never writes to the working tree, on success or failure.
 */
async function check(): Promise<void> {
  ensureGenerationEnvironment();
  const app = await createApiApplication({ logger: false });
  let candidate: string;
  try {
    candidate = serializeOpenApiDocument(buildOpenApiDocument(app));
  } finally {
    await app.close();
  }

  const artifactPath = resolveArtifactPath(__dirname);
  const comparison = compareArtifact(readCommittedArtifact(artifactPath), candidate);

  if (comparison.matches) {
    process.stdout.write(`OpenAPI artifact is up to date: ${artifactPath}\n`);
    return;
  }

  const detail =
    comparison.reason === 'missing'
      ? `Committed OpenAPI artifact is missing at ${artifactPath}.`
      : `Committed OpenAPI artifact at ${artifactPath} is out of date.`;
  process.stderr.write(`${detail}\nRegenerate it with: pnpm openapi:generate\n`);
  process.exitCode = 1;
}

check().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
