import { access } from 'node:fs/promises';
import process from 'node:process';

import { GENERATED_DIR, OPENAPI_ARTIFACT, runOrval } from './orval-config.mjs';
import { formatGeneratedDir, hashGeneratedTree } from './generated-tree.mjs';

/**
 * Regenerate the tracked API client from the committed OpenAPI artifact:
 * verify the artifact, run Orval (which cleans the target), format with the
 * repo Prettier config, then report a deterministic tree summary.
 */
async function main() {
  try {
    await access(OPENAPI_ARTIFACT);
  } catch {
    console.error(`[api-client] OpenAPI artifact not found: ${OPENAPI_ARTIFACT}`);
    console.error('[api-client] Run `pnpm openapi:generate` first.');
    process.exitCode = 1;
    return;
  }

  runOrval();
  await formatGeneratedDir(GENERATED_DIR);

  const { hash, files, totalBytes, totalLines } = await hashGeneratedTree(GENERATED_DIR);
  console.log(`[api-client] generated ${files.length} file(s): ${files.join(', ')}`);
  console.log(`[api-client] bytes=${totalBytes} lines=${totalLines}`);
  console.log(`[api-client] tree hash: ${hash}`);
}

await main();
