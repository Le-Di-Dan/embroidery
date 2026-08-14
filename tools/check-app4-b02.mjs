#!/usr/bin/env node
/**
 * `APP4-B02` — the customer/contact application core.
 *
 * The failures this gate exists for all look like helpfulness. Adding a
 * `POST /customers` "so the frontend can create one". Auto-linking a customer
 * whose *unverified* row happens to match, because it obviously is the same
 * person. Catching `23505` broadly, which silently turns a breached
 * primary-contact invariant into a "concurrent verification". Logging the driver
 * error to debug a race, which writes the duplicated address into the
 * application log. Following `merged_into_customer_id`, which is merge. Each one
 * works, and each one breaks a locked rule of `ADR-DB2-001`.
 *
 * So most assertions are **negations**, and every one is measured against real
 * source with comments stripped — never against prose and never against the
 * completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b02.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MODULE_DIR = 'apps/api/src/modules/customer';
/** Exactly the surface `APP4-B02` owns. Delivered DB7 code is not measured by it. */
export const B02_DIRS = Object.freeze([
  `${MODULE_DIR}/application`,
  `${MODULE_DIR}/domain/identity`,
]);

export const CANONICAL_FILES = Object.freeze({
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  customerModule: `${MODULE_DIR}/customer.module.ts`,
  service: `${MODULE_DIR}/application/resolve-or-create-verified-customer.service.ts`,
  recorder: `${MODULE_DIR}/application/customer-identity-audit.recorder.ts`,
  evidence: `${MODULE_DIR}/domain/identity/verified-contact-evidence.ts`,
  outcome: `${MODULE_DIR}/domain/identity/verified-identity-outcome.ts`,
  repositoryPort: `${MODULE_DIR}/domain/repositories/customer.repository.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const CAPABILITY_CLASS = 'ResolveOrCreateVerifiedCustomer';
/** The catalogued meaning of CST-005. The only conflict B02 may translate. */
export const CST_005_CODE = 'CONTACT_ALREADY_VERIFIED';
const MIGRATION_COUNT = 34;

const isTest = (path) => /\.(spec|test|bench)\.ts$/.test(path) || path.includes('/tests/');

const shown = (rootDir, file) =>
  file
    .slice(rootDir.length + 1)
    .split('\\')
    .join('/');

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function sourceFiles(rootDir, relative, extension = '.ts') {
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(extension)) found.push(full);
    }
  };
  walk(join(rootDir, relative));
  return found;
}

/** Production files of a tree, as `{ path, raw, code }` with prose removed. */
function productionSources(rootDir, relative) {
  return sourceFiles(rootDir, relative)
    .map((file) => ({ path: shown(rootDir, file), raw: readFileSync(file, 'utf8') }))
    .filter((file) => !isTest(file.path))
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

/** The B02-owned production files only. */
function b02Sources(rootDir) {
  return B02_DIRS.flatMap((relative) => productionSources(rootDir, relative));
}

/** The `imports: [...]` array of a Nest module, with prose removed. */
function moduleImports(source) {
  return /imports:\s*\[([\s\S]*?)\n\s*\]/.exec(stripComments(source))?.[1] ?? '';
}

/** 1, 2, 3, 5, 6, 7 — composition, placement, and no HTTP surface. */
function checkComposition(rootDir, fail) {
  const appImports = moduleImports(read(rootDir, 'appModule') ?? '');
  for (const composed of ['CustomerModule', 'NotificationModule', 'PolicyModule']) {
    // Composition means membership of the imports array, not merely that the
    // name appears in the file — an unused import statement satisfies that too.
    const occurrences = [...appImports.matchAll(new RegExp(`\\b${composed}\\b`, 'g'))].length;
    if (occurrences !== 1) {
      fail(
        `${CANONICAL_FILES.appModule}: ${composed} appears ${String(occurrences)} times in imports`,
      );
    }
  }

  const customerModuleRaw = read(rootDir, 'customerModule');
  if (customerModuleRaw === undefined) {
    fail(`${CANONICAL_FILES.customerModule} does not exist`);
    return;
  }
  const customerModule = stripComments(customerModuleRaw);
  if (!new RegExp(`providers:[\\s\\S]*?\\b${CAPABILITY_CLASS}\\b`).test(customerModule)) {
    fail(`${CANONICAL_FILES.customerModule}: ${CAPABILITY_CLASS} is not provided`);
  }
  if (!new RegExp(`exports:[\\s\\S]*?\\b${CAPABILITY_CLASS}\\b`).test(customerModule)) {
    fail(`${CANONICAL_FILES.customerModule}: ${CAPABILITY_CLASS} is not exported for APP4-B04`);
  }
  if (/controllers:/.test(customerModule)) {
    fail(`${CANONICAL_FILES.customerModule}: declares controllers; B02 has 0 endpoints`);
  }

  // 5 — the capability lives where the manifest puts it.
  if (read(rootDir, 'service') === undefined) {
    fail(`${CANONICAL_FILES.service} does not exist`);
  }

  // 6, 7, 20 — no route, no DTO, no OpenAPI decorator anywhere in the module.
  const httpShapes = [
    '@Controller',
    '@Get(',
    '@Post(',
    '@Put(',
    '@Patch(',
    '@Delete(',
    '@Body(',
    '@nestjs/swagger',
    '@ApiProperty',
    '@ApiResponse',
    '@ApiOperation',
    'createZodDto',
  ];
  for (const file of productionSources(rootDir, MODULE_DIR)) {
    for (const shape of httpShapes) {
      if (file.code.includes(shape)) {
        fail(`${file.path}: ${shape} appears; B02 publishes no HTTP surface`);
      }
    }
  }
}

/** 4, 16 — one capability, one creation path, the existing transaction seam. */
function checkCapability(rootDir, fail) {
  const serviceRaw = read(rootDir, 'service') ?? '';
  const service = stripComments(serviceRaw);

  if (!new RegExp(`export class ${CAPABILITY_CLASS}\\b`).test(service)) {
    fail(`${CANONICAL_FILES.service}: no exported ${CAPABILITY_CLASS} class`);
  }

  // Exactly one production caller of the only creation method that exists, and
  // it is this service. A second caller would be a second identity rule.
  const callers = productionSources(rootDir, 'apps/api/src')
    .filter((file) => /\.createWithVerifiedContact\s*\(/.test(file.code))
    .map((file) => file.path);
  if (callers.length !== 1 || callers[0] !== CANONICAL_FILES.service) {
    fail(
      `createWithVerifiedContact has ${String(callers.length)} production caller(s) ` +
        `[${callers.join(', ')}]; exactly one is allowed and it must be the B02 service`,
    );
  }

  if (!/TransactionManager/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not depend on TransactionManager`);
  }
  // Both capabilities, not merely the file. Split at the second method so each
  // half is checked on its own: a single `runInTransaction` anywhere would let
  // one of the two write paths escape the boundary unnoticed.
  const halves = service.split('async attachVerifiedContact(');
  if (halves.length !== 2) {
    fail(`${CANONICAL_FILES.service}: no attachVerifiedContact capability`);
  }
  for (const [index, label] of ['resolve', 'attachVerifiedContact'].entries()) {
    if (halves[index] !== undefined && !halves[index].includes('runInTransaction(')) {
      fail(`${CANONICAL_FILES.service}: ${label} does not use the existing transaction boundary`);
    }
  }

  // No second transaction system, and no reach around the repository.
  for (const file of b02Sources(rootDir)) {
    for (const [needle, why] of [
      ['drizzle-orm', 'the application layer never touches the ORM'],
      ['executeRaw', 'the application layer issues no SQL'],
      ['BEGIN', 'there is only one transaction system'],
      ['savepoint', 'B02 introduces no transaction semantics of its own'],
      ['schema.', 'the application layer knows no table'],
    ]) {
      if (file.code.includes(needle)) {
        fail(`${file.path}: ${why} ("${needle}")`);
      }
    }
  }
}

/** 14, 15 — the CST-005 translation is exact and carries nothing with it. */
function checkConflictHandling(rootDir, fail) {
  const service = stripComments(read(rootDir, 'service') ?? '');

  if (!service.includes(`'${CST_005_CODE}'`)) {
    fail(`${CANONICAL_FILES.service}: does not match the catalogued ${CST_005_CODE} code`);
  }
  if (!/CONCURRENT_VERIFICATION_LOSS/.test(service)) {
    fail(`${CANONICAL_FILES.service}: no bounded concurrent-verification-loss outcome`);
  }
  // A SQLSTATE match would also catch CST-006 and the primary key.
  if (/'23505'|"23505"/.test(service)) {
    fail(`${CANONICAL_FILES.service}: matches the raw SQLSTATE; CST-005 is not the only 23505`);
  }
  // `kind === 'CONFLICT'` alone is every unique arbiter in the schema, so the
  // guard must also narrow to the one catalogued code.
  if (
    /kind\s*===\s*'CONFLICT'/.test(service) &&
    !new RegExp(`code\\s*===\\s*'?${CST_005_CODE}'?`).test(service)
  ) {
    fail(`${CANONICAL_FILES.service}: the conflict guard does not narrow to one constraint`);
  }

  const outcome = stripComments(read(rootDir, 'outcome') ?? '');
  if (!/VERIFIED_IDENTITY_FAILURES\s*=\s*\[/.test(outcome)) {
    fail(`${CANONICAL_FILES.outcome}: the failure set is not a closed list`);
  }
  // Every failure the service raises must be a declared member.
  const declared = new Set([...outcome.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]));
  for (const file of b02Sources(rootDir)) {
    for (const match of file.code.matchAll(/new VerifiedIdentityConflictError\(\s*'([^']+)'/g)) {
      if (!declared.has(match[1])) {
        fail(`${file.path}: raises the undeclared failure "${match[1]}"`);
      }
    }
  }

  // 15 — nothing that carries a driver detail may travel or be recorded.
  for (const file of b02Sources(rootDir)) {
    for (const [needle, why] of [
      ['diagnostics', 'PersistenceError diagnostics name the constraint'],
      ['Logger', 'B02 logs nothing; a driver error would carry the address'],
      ['console.', 'B02 logs nothing'],
      ['DETAIL', 'PostgreSQL DETAIL quotes the duplicated contact value'],
      ['sqlState', 'a SQLSTATE is an infrastructure detail'],
      ['error.message', 'a driver message must never be re-raised'],
      ['{ cause:', 'the bounded failure carries no cause to unwrap'],
    ]) {
      if (file.code.includes(needle)) {
        fail(`${file.path}: ${why} ("${needle}")`);
      }
    }
  }
}

/** 9, 10, 11, 19 — merge, business profiles, search and credentials stay out. */
function checkScopeBoundaries(rootDir, fail) {
  for (const file of b02Sources(rootDir)) {
    for (const [pattern, why] of [
      [/mergedIntoCustomerId\s*:/, 'writes the merge tombstone pointer'],
      [/merged_into_customer_id/, 'writes the merge tombstone pointer'],
      [/customerMergeCases|customer_merge_cases|MergeCase/, 'touches customer merge cases'],
      [/upsertBusinessProfile|businessProfiles|business_profiles/, 'authors a business profile'],
      [/\bsearch\b|\bilike\b|\boffset\b|\blistCustomers\b/i, 'searches or lists customers'],
      [/password|credential|\blogin\b|refreshToken/i, 'introduces a customer credential'],
      [/anonymize\(/, 'executes anonymization'],
      [/libphonenumber/, 'parses a phone number itself'],
      [/toLowerCase\(|toUpperCase\(/, 'normalizes a contact itself'],
    ]) {
      if (pattern.test(file.code)) {
        fail(`${file.path}: ${why}`);
      }
    }
  }

  // The delivered repository must not have gained a merge write either.
  for (const file of productionSources(rootDir, MODULE_DIR)) {
    if (/set\(\{[^}]*mergedIntoCustomerId/.test(file.code.replace(/\s+/g, ' '))) {
      fail(`${file.path}: the repository gained a merge write`);
    }
  }

  // 12 — normalization is reused, not reimplemented. Both halves are required:
  // an import alone survives being replaced by a local helper.
  const evidenceRaw = read(rootDir, 'evidence') ?? '';
  if (
    !/NormalizedContact/.test(stripComments(evidenceRaw)) ||
    !importSpecifiers(evidenceRaw).some((specifier) => specifier.endsWith('contact/contact-value'))
  ) {
    fail(`${CANONICAL_FILES.evidence}: does not take the P01 normalized contact as its input`);
  }
}

/** 17, 18 — every mutation is audited, and the evidence carries no contact. */
function checkAudit(rootDir, fail) {
  const recorderRaw = read(rootDir, 'recorder');
  if (recorderRaw === undefined) {
    fail(`${CANONICAL_FILES.recorder} does not exist`);
    return;
  }
  const recorder = stripComments(recorderRaw);

  if (
    !/AUDIT_EVENT_REPOSITORY/.test(recorder) ||
    // The repository's own `append`, not the recorder's internal delegation —
    // which is also spelled `this.append(` and would satisfy a looser pattern.
    !/this\.events\.append\(/.test(recorder) ||
    !importSpecifiers(recorderRaw).some((specifier) => specifier.includes('audit/domain'))
  ) {
    fail(`${CANONICAL_FILES.recorder}: does not write through the existing audit capability`);
  }
  if (!/requireRequestId\(\)/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: does not correlate through the request context`);
  }

  // 18 — the summary is server-derived and bounded. A masked form is still
  // derived from the address, so it is refused too.
  for (const [pattern, why] of [
    [/normalized/i, 'the normalized contact'],
    [/displayValue|display_value/, 'the display contact'],
    [/mask/i, 'a masked contact'],
    [/verifiedSource/, 'a caller-supplied evidence string'],
    [/\.contact\b/, 'the contact object'],
  ]) {
    if (pattern.test(recorder)) {
      fail(`${CANONICAL_FILES.recorder}: the audit writer references ${why}`);
    }
  }

  // Both mutation paths record. A creation or attachment that wrote no evidence
  // would breach INV-14 and ADR-DB2-001 r5.
  const service = stripComments(read(rootDir, 'service') ?? '');
  for (const call of ['recordIdentityCreated(', 'recordContactAttached(']) {
    if (!service.includes(call)) {
      fail(`${CANONICAL_FILES.service}: does not call ${call}`);
    }
  }
}

/** 8, 20 — no schema, no migration, no published contract. */
function checkNoSchemaOrContract(rootDir, fail) {
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B02 adds none`);
  }

  for (const file of productionSources(rootDir, MODULE_DIR)) {
    if (/pgTable\(|uniqueIndex\(|alterTable/i.test(file.code)) {
      fail(`${file.path}: declares schema; B02 changes none`);
    }
  }

  const openapi = read(rootDir, 'openapi');
  if (openapi === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return;
  }
  const document = JSON.parse(openapi);
  const customerPaths = Object.keys(document.paths ?? {}).filter((path) => /customer/i.test(path));
  if (customerPaths.length > 0) {
    fail(
      `${CANONICAL_FILES.openapi}: publishes customer path(s) ${customerPaths.join(', ')}; ` +
        'B02 has 0 endpoints',
    );
  }
  const customerSchemas = Object.keys(document.components?.schemas ?? {}).filter((name) =>
    /^Customer|Customer(Request|Response|Dto)/.test(name),
  );
  if (customerSchemas.length > 0) {
    fail(`${CANONICAL_FILES.openapi}: publishes customer schema(s) ${customerSchemas.join(', ')}`);
  }
}

export function checkApp4B02(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkComposition(rootDir, fail);
  checkCapability(rootDir, fail);
  checkConflictHandling(rootDir, fail);
  checkScopeBoundaries(rootDir, fail);
  checkAudit(rootDir, fail);
  checkNoSchemaOrContract(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4B02(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-b02 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app4-b02 — CustomerModule is composed once beside NotificationModule and ' +
      'PolicyModule with no controller and no route; one exported ' +
      `${CAPABILITY_CLASS} is the single production caller of createWithVerifiedContact and ` +
      'runs inside the existing transaction boundary; its input is the P01 normalized contact, ' +
      `so no normalization is duplicated; the ${CST_005_CODE} arbiter is translated into a ` +
      'closed failure set with no SQLSTATE match, no diagnostics, no driver message and no log; ' +
      'both mutations write through the existing audit capability and the evidence carries no ' +
      'contact value; and no merge, business profile, search, credential, schema, migration or ' +
      'OpenAPI surface is part of it',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
