#!/usr/bin/env node
/**
 * Generates the canonical Design Document JSON Schema from P01's own TypeScript
 * types (`APP3-B08-C1`).
 *
 * The whole point is that this file authors **nothing**. `APP3-B08-C1`'s audit
 * established that P01 has no declarative schema — the shape lives in TypeScript
 * `interface` declarations and the imperative validators that read them — so any
 * hand-written schema would be a second field definition that drifts the first
 * time an interface changes. Deriving the schema from those same declarations
 * keeps exactly one definition: the types.
 *
 * What this does *not* do is equally deliberate. TypeScript expresses structure,
 * not P01's runtime semantics: NFC normalization, non-empty strings, non-zero
 * scale factors, the `fontSizePx` range, integer `fontWeight`, and the 2..5000
 * freehand point bound are all enforced by the validators and are absent here.
 * Restating them would recreate the very duplication this exists to avoid. The
 * published schema is a structural contract; P01 remains the semantic authority.
 *
 * Determinism matters because the output is committed and gated: `sortProps`
 * fixes key order and every option below is pinned, so the same types always
 * produce the same bytes.
 *
 * Usage:
 *   node scripts/generate-schema.mjs [--check]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The P01 type that is the contract. Not an API-specific alias. */
export const ROOT_TYPE = 'DesignDocument';

/** The single source file the generator walks. */
export const SOURCE_ENTRY = 'src/schema/document.ts';

/**
 * Inside `src/` on purpose: `tsconfig.build.json` sets `rootDir: ./src`, so an
 * artifact anywhere else would never reach `dist` and the API — which consumes
 * the built package (IMP-D018) — could not import it.
 */
export const SCHEMA_FILE = join(
  PACKAGE_ROOT,
  'src',
  'schema',
  'generated',
  'design-document.schema.json',
);

const BANNER = {
  $comment:
    'GENERATED — DO NOT EDIT. Produced by scripts/generate-schema.mjs from the ' +
    `TypeScript type ${ROOT_TYPE} in ${SOURCE_ENTRY}. Structural contract only: ` +
    'P01 runtime validation remains the semantic authority (NFC, non-empty ' +
    'strings, non-zero scale, value ranges, point-count bounds). Regenerate ' +
    'rather than editing; the currentness gate fails on drift.',
};

export function buildSchema() {
  const generator = createGenerator({
    path: join(PACKAGE_ROOT, SOURCE_ENTRY),
    tsconfig: join(PACKAGE_ROOT, 'tsconfig.json'),
    type: ROOT_TYPE,
    // Exported types become named definitions, so the element union and the
    // placement snapshot publish as reusable components rather than being
    // inlined at every use.
    expose: 'export',
    topRef: true,
    jsDoc: 'extended',
    // P01 rejects unknown keys at runtime; the structural schema says so too.
    additionalProperties: false,
    sortProps: true,
    strictTuples: true,
    encodeRefs: false,
  });
  return { ...BANNER, ...generator.createSchema(ROOT_TYPE) };
}

/** Stable serialization: sorted by the generator, two-space, trailing newline. */
export function serialize(schema) {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/**
 * Whether a committed artifact still matches the types.
 *
 * Exported so the drift proof can feed it a mutated string rather than editing
 * the real committed artifact or the real P01 source to watch a gate fail.
 */
export function isCurrent(committedText) {
  return committedText === serialize(buildSchema());
}

function main() {
  const serialized = serialize(buildSchema());
  // `--stdout` exists so the determinism and drift proofs can drive the real
  // command rather than a re-implementation of it.
  if (process.argv.includes('--stdout')) {
    process.stdout.write(serialized);
    return;
  }
  if (process.argv.includes('--check')) {
    // An explicit path lets a test point the check at a mutated *copy*; without
    // it the only way to watch the gate fail would be to damage the real
    // artifact or the real types.
    const index = process.argv.indexOf('--check');
    const target = process.argv[index + 1] ?? SCHEMA_FILE;
    let committed;
    try {
      committed = readFileSync(target, 'utf8');
    } catch {
      console.error('design-document schema: the generated artifact is missing.');
      process.exitCode = 1;
      return;
    }
    if (committed !== serialized) {
      console.error(
        'design-document schema: the committed artifact does not match the ' +
          'current TypeScript types. Run `pnpm --filter @embroidery/design-document schema:generate`.',
      );
      process.exitCode = 1;
      return;
    }
    console.log('design-document schema: up to date.');
    return;
  }
  mkdirSync(dirname(SCHEMA_FILE), { recursive: true });
  writeFileSync(SCHEMA_FILE, serialized, 'utf8');
  console.log(`design-document schema: written ${SCHEMA_FILE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
