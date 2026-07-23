import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

// Resolve the repository Prettier config from a stable in-repo anchor (this
// module's own path). Resolving per generated file would find no config when a
// candidate tree lives in an OS temp directory, silently falling back to
// Prettier defaults and breaking drift comparison.
const PRETTIER_ANCHOR = fileURLToPath(import.meta.url);

/** List generated file paths relative to `dir`, sorted for stable ordering. */
export async function listGeneratedFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .map((rel) => rel.split(path.sep).join('/'))
    .sort();
}

/** Format every generated `.ts` file in place with the repo Prettier config. */
export async function formatGeneratedDir(dir) {
  const config = await prettier.resolveConfig(PRETTIER_ANCHOR);
  const files = await listGeneratedFiles(dir);
  for (const rel of files) {
    const abs = path.join(dir, rel);
    const source = await readFile(abs, 'utf8');
    const formatted = await prettier.format(source, {
      ...config,
      parser: 'typescript',
    });
    await writeFile(abs, formatted, 'utf8');
  }
}

/**
 * Deterministic SHA-256 over the generated tree: sort relative paths, hash each
 * `path + "\n" + LF-normalized content`, combine into one digest. Also returns
 * per-file stats for reporting.
 */
export async function hashGeneratedTree(dir) {
  const files = await listGeneratedFiles(dir);
  const combined = createHash('sha256');
  const fileHashes = new Map();
  let totalBytes = 0;
  let totalLines = 0;
  for (const rel of files) {
    const content = await readFile(path.join(dir, rel), 'utf8');
    const normalized = content.replace(/\r\n/g, '\n');
    totalBytes += Buffer.byteLength(normalized, 'utf8');
    totalLines += normalized.split('\n').length;
    fileHashes.set(rel, createHash('sha256').update(normalized).digest('hex'));
    combined.update(rel);
    combined.update('\n');
    combined.update(normalized);
    combined.update('\0');
  }
  return { hash: combined.digest('hex'), files, fileHashes, totalBytes, totalLines };
}

/**
 * Pure comparison of a freshly generated tree (`expected`) against the tracked
 * tree. `missing` = produced by generation but absent from tracked; `unexpected`
 * = tracked but no longer produced; `changed` = present in both with differing
 * content. Both arguments are `hashGeneratedTree` results.
 */
export function diffTrees(expected, tracked) {
  const missing = expected.files.filter((file) => !tracked.fileHashes.has(file));
  const unexpected = tracked.files.filter((file) => !expected.fileHashes.has(file));
  const changed = expected.files.filter(
    (file) =>
      tracked.fileHashes.has(file) &&
      tracked.fileHashes.get(file) !== expected.fileHashes.get(file),
  );
  return {
    inSync: missing.length === 0 && unexpected.length === 0 && changed.length === 0,
    missing,
    unexpected,
    changed,
  };
}
