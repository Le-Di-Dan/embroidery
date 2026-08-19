/**
 * `APP6-G01` authority constants and readers (`IMP-D051`).
 *
 * Split from the gate for the same reason `check-app4-g01-authority.mjs` is:
 * the mutation test needs to point every reader at a throwaway copy of the
 * repository, and a gate that inlined its own paths could not be pointed
 * anywhere.
 *
 * Nothing here restates a policy value. The values live in the seed dataset and
 * the ADR fact table, and the gate's job is to prove those two agree — a
 * constant here would silently become a third source.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const DECISION_ID = 'IMP-D051';
export const SCHEMA_CONTRACT = 'CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS';

export const CANONICAL_FILES = {
  adr: 'docs/adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md',
  authority: 'docs/implementation/audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  phase: 'docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md',
  dataset: 'packages/database/seed/app6-policy-configuration.seed.json',
  figma: 'docs/design/FIGMA_DESIGN_INDEX.md',
  designVersions: 'packages/database/src/schema/design/design-versions.ts',
  approvalSnapshots: 'packages/database/src/schema/design/approval-snapshots.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  rootPackage: 'package.json',
};

/** The six grouped rulings the register row must record. */
export const RULINGS = ['PO-01', 'PO-02', 'PO-03', 'PO-04', 'PO-05', 'PO-06'];

/** The three dataset keys, in dataset order. */
export const POLICY_KEYS = [
  'quotation.validity',
  'quotation.deposit',
  'design_approval.agreements',
];

/**
 * The five APP6 LC-11 transitions and the actor each must carry.
 *
 * `system` for four of them is the whole point of the checkpoint: a later
 * checkpoint that quietly turns one into an admin command is the failure this
 * gate exists to catch, and it would look perfectly reasonable in review.
 */
export const TRANSITIONS = [
  ['TR-LC11-05', 'system'],
  ['TR-LC11-06', 'system'],
  ['TR-LC11-07', 'admin'],
  ['TR-LC11-08', 'system'],
  ['TR-LC11-09', 'system'],
];

/** The four states no APP6 surface may offer as a transition target. */
export const SYSTEM_TARGETS = ['QUOTED', 'QUOTE_ACCEPTED', 'DESIGN_REVIEW', 'APPROVED'];

/**
 * Frozen global artifact counts.
 *
 * An authority checkpoint that changed one of these did something it was
 * forbidden to do, so they are asserted rather than described.
 */
export const FROZEN = {
  migrations: 35,
  rootScripts: 30,
  openapiPaths: 58,
  openapiOperations: 63,
  openapiSchemas: 132,
  figmaApp06References: 0,
};

/** Reads a canonical file, or `undefined` when it is absent. */
export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key]);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** The seed dataset, parsed. Throws when it is absent or not JSON. */
export function dataset(rootDir) {
  const text = read(rootDir, 'dataset');
  if (text === undefined) throw new Error(`${CANONICAL_FILES.dataset} is missing`);
  return JSON.parse(text);
}

/**
 * The `§6.x` fact rows of the ADR, as `key -> value` with the backticks removed.
 *
 * Rows are `| \`key\` | \`value\` | unit | meaning |`; only the first two cells
 * are read, because the unit and the prose are for humans and asserting them
 * would make the gate fail on an editorial change.
 */
export function factTable(adrText) {
  return new Map(
    adrText
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|\s*$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

/** The `§6.x` form of a dataset value, so one table can hold scalars and lists. */
export function factValue(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
}

/** Every leaf `key: value` pair of a dataset configuration's value object. */
export function valueEntries(configuration) {
  return Object.entries(configuration.value ?? {});
}

/** Migration files on disk. */
export function migrationCount(rootDir) {
  const dir = join(rootDir, 'packages/database/migrations');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => name.endsWith('.sql')).length;
}

/** Root `package.json` script count. */
export function rootScriptCount(rootDir) {
  const text = read(rootDir, 'rootPackage');
  if (text === undefined) return -1;
  return Object.keys(JSON.parse(text).scripts ?? {}).length;
}

/** Committed OpenAPI artifact counts. Never regenerates. */
export function openapiCounts(rootDir) {
  const text = read(rootDir, 'openapi');
  if (text === undefined) return undefined;
  const document = JSON.parse(text);
  const paths = Object.keys(document.paths ?? {});
  let operations = 0;
  for (const path of paths) operations += Object.keys(document.paths[path]).length;
  return {
    paths: paths.length,
    operations,
    schemas: Object.keys(document.components?.schemas ?? {}).length,
  };
}

/** How many times the Figma registry mentions `APP_06`. */
export function figmaApp06References(rootDir) {
  const text = read(rootDir, 'figma');
  if (text === undefined) return -1;
  return (text.match(/APP_06/g) ?? []).length;
}

/**
 * Whether a schema file still declares a column `NOT NULL`.
 *
 * `APP6-G01` is forbidden to touch schema, so this asserts the *absence* of the
 * `APP6-DB01` migration having been executed early — the single most likely way
 * an authority checkpoint overreaches while looking productive.
 */
export function declaresNotNull(source, column) {
  return new RegExp(`idReference\\('${column}'\\)\\.notNull\\(\\)`).test(source);
}
