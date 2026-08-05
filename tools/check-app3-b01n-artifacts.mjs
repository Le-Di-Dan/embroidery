/**
 * The artifacts `APP3-B01N` must leave byte-for-byte alone.
 *
 * Split out of `check-app3-b01n.mjs` because it is a different kind of check:
 * everything here is a *measurement* of a generated or frozen artifact, and it
 * has to reproduce `check:generated`'s tree hash exactly rather than reason
 * about source. A count would not be enough — a checkpoint that swapped one
 * operation for another would keep the count and change the contract — so the
 * digest is the assertion and the counts only make a failure readable.
 *
 * Read-only, cross-platform pure Node.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The published surface, frozen **per world** (`APP3-B01-C1`, extended by
 * `APP3-B02`).
 *
 * `APP3-B01N` publishes no HTTP surface at all, and that is the property being
 * asserted — the totals and the digests are only how it is measured. A single
 * frozen digest could not survive the checkpoint that legitimately adds one
 * operation, so there are two exact worlds and no third: the artifacts must
 * match `B01N` before `APP3-B02` and `B02` after it. Both are recomputed here,
 * never trusted from a report.
 */
export const OPENAPI_FACTS = Object.freeze({ paths: 18, operations: 22, schemas: 44 });
export const OPENAPI_FACTS_AFTER_B02 = Object.freeze({ paths: 19, operations: 23, schemas: 45 });
export const OPENAPI_FILE = 'packages/contracts/openapi/openapi.generated.json';
const OPENAPI_SHA256 = '53ef5650c7e09cb93db885b452f2ae0a15ff4237de0eada9991807ce1629349e';
const CLIENT_TREE_SHA256 = '7c44662902317e306d2deecd128b544ab2ad9faf5298bed7d813d3377a6b19bf';
const OPENAPI_SHA256_AFTER_B02 = '38ab7dae47d297471325424496668ca6526fe533915f9df4302f691d7f6be683';
const CLIENT_TREE_SHA256_AFTER_B02 =
  '129883fa61c01c15a19150256f27cdbddc37c92eac3a848b6e22b77bb4629d9c';
const PHASE_FILE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';

/** True once `APP3-B02` has delivered its one public operation. */
function isB02Delivered(rootDir) {
  const path = join(rootDir, PHASE_FILE);
  return existsSync(path) && /APP3-B02\s*=\s*COMPLETE/.test(readFileSync(path, 'utf8'));
}
const GENERATED_CLIENT_DIR = 'packages/api-client/src/generated';
const MIGRATION_COUNT = 34;
const HTTP_METHODS = ['get', 'put', 'post', 'patch', 'delete'];

/**
 * The generated client's tree hash, computed exactly as `check:generated` does:
 * path, newline, LF-normalized content, NUL, in sorted order.
 */
function hashGeneratedTree(dir) {
  const files = [];
  const walk = (directory, prefix) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), relative);
      else files.push(relative);
    }
  };
  walk(dir, '');

  const combined = createHash('sha256');
  for (const relative of files.sort()) {
    combined.update(relative);
    combined.update('\n');
    combined.update(readFileSync(join(dir, ...relative.split('/')), 'utf8').replace(/\r\n/g, '\n'));
    combined.update('\0');
  }
  return combined.digest('hex');
}

/** 12, 13 — no HTTP surface, no client change, no migration. */
export function checkApp3B01NArtifacts(rootDir, fail) {
  const afterB02 = isB02Delivered(rootDir);
  const facts = afterB02 ? OPENAPI_FACTS_AFTER_B02 : OPENAPI_FACTS;
  const expectedDigest = afterB02 ? OPENAPI_SHA256_AFTER_B02 : OPENAPI_SHA256;
  const expectedTree = afterB02 ? CLIENT_TREE_SHA256_AFTER_B02 : CLIENT_TREE_SHA256;

  const path = join(rootDir, OPENAPI_FILE);
  if (!existsSync(path)) {
    fail('the OpenAPI artifact is missing');
  } else {
    const raw = readFileSync(path);
    const digest = createHash('sha256').update(raw).digest('hex');
    if (digest !== expectedDigest) fail(`the OpenAPI artifact changed (sha256 ${digest})`);

    const document = JSON.parse(raw.toString('utf8'));
    const items = Object.values(document.paths ?? {});
    for (const [measured, expected, label] of [
      [Object.keys(document.paths ?? {}).length, facts.paths, 'paths'],
      [
        items.flatMap((item) => Object.keys(item).filter((m) => HTTP_METHODS.includes(m))).length,
        facts.operations,
        'operations',
      ],
      [Object.keys(document.components?.schemas ?? {}).length, facts.schemas, 'schemas'],
    ]) {
      if (measured !== expected) {
        fail(`the OpenAPI document declares ${String(measured)} ${label}; B01N adds none`);
      }
    }
    if (JSON.stringify(document).includes('normalization')) {
      fail('an HTTP operation or schema mentions normalization; B01N adds no HTTP surface');
    }
  }

  const tree = hashGeneratedTree(join(rootDir, GENERATED_CLIENT_DIR));
  if (tree !== expectedTree) fail(`the generated client changed (tree hash ${tree})`);

  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; B01N adds none`);
  }
}
