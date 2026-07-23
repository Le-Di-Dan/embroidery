import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { GENERATED_DIR, MUTATOR_FILE, runOrval } from './orval-config.mjs';
import { diffTrees, formatGeneratedDir, hashGeneratedTree } from './generated-tree.mjs';

const REGENERATE_HINT =
  'Run `pnpm --filter @embroidery/api-client generate` and commit the result.';

/**
 * Non-mutating drift gate: regenerate into an OS temp directory that mirrors
 * the package layout (so the generated mutator import stays identical), format
 * identically, and compare against the tracked `src/generated` tree. Never
 * writes to tracked files; cleans the temp directory in `finally`.
 *
 * Returns the drift descriptors so tests can assert behavior; the CLI entry
 * point sets a non-zero exit code on drift.
 */
export async function checkGeneratedClient() {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'embroidery-api-client-drift-'));
  try {
    const tmpGeneratedDir = path.join(tmpRoot, 'src', 'generated');
    const tmpClientsDir = path.join(tmpRoot, 'src', 'clients');
    await mkdir(tmpGeneratedDir, { recursive: true });
    await mkdir(tmpClientsDir, { recursive: true });
    const tmpMutator = path.join(tmpClientsDir, path.basename(MUTATOR_FILE));
    await copyFile(MUTATOR_FILE, tmpMutator);

    runOrval({
      outputTarget: path.join(tmpGeneratedDir, 'embroidery-api.ts'),
      mutatorPath: tmpMutator,
    });
    await formatGeneratedDir(tmpGeneratedDir);

    const expected = await hashGeneratedTree(tmpGeneratedDir);
    const tracked = await hashGeneratedTree(GENERATED_DIR);
    const diff = diffTrees(expected, tracked);
    return { ...diff, expectedHash: expected.hash, trackedHash: tracked.hash };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

async function main() {
  const result = await checkGeneratedClient();
  if (result.inSync) {
    console.log(`[api-client] generated client is up to date (tree hash ${result.trackedHash}).`);
    return;
  }
  console.error('[api-client] Generated client is out of date with the OpenAPI artifact.');
  if (result.missing.length > 0) console.error(`  missing:    ${result.missing.join(', ')}`);
  if (result.unexpected.length > 0) console.error(`  unexpected: ${result.unexpected.join(', ')}`);
  if (result.changed.length > 0) console.error(`  changed:    ${result.changed.join(', ')}`);
  console.error(`  expected tree hash: ${result.expectedHash}`);
  console.error(`  tracked  tree hash: ${result.trackedHash}`);
  console.error(`  ${REGENERATE_HINT}`);
  process.exitCode = 1;
}

// Run as a script only (not when imported by tests).
if (process.argv[1] !== undefined && process.argv[1].endsWith('check-generated-client.mjs')) {
  await main();
}
