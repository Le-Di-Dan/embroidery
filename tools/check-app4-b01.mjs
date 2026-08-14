#!/usr/bin/env node
/**
 * `APP4-B01` — notification intent intake and the shared delivery envelope.
 *
 * The failure this gate exists for is not a deleted line; it is a *convenient*
 * one. Copying the cipher into `apps/api` so the worker "does not need a
 * package". Letting the worker read `originNotificationIntentId` because on the
 * first delivery it happens to equal the current intent. Slipping the ciphertext
 * into `notification_intents.params` because it is already a JSONB column.
 * Adding a `NotificationChannelPort` "while we are here". Each of those makes
 * the next checkpoint easier and each undoes the reason B01 was scoped this way.
 *
 * So the assertions are mostly **negations**, and every one is measured against
 * real source rather than against the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b01.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkPolicyPublication } from './check-app4-b01-policy.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PACKAGE_DIR = 'packages/notification-delivery';
export const PACKAGE_NAME = '@embroidery/notification-delivery';

export const CANONICAL_FILES = Object.freeze({
  packageManifest: `${PACKAGE_DIR}/package.json`,
  contract: `${PACKAGE_DIR}/src/delivery-envelope.contract.ts`,
  codec: `${PACKAGE_DIR}/src/delivery-envelope.codec.ts`,
  envelopeKey: `${PACKAGE_DIR}/src/envelope-key.ts`,
  packageIndex: `${PACKAGE_DIR}/src/index.ts`,
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  notificationModule: 'apps/api/src/modules/notification/notification.module.ts',
  useCase: 'apps/api/src/modules/notification/application/request-notification.use-case.ts',
  intentKey: 'apps/api/src/modules/notification/domain/notification-intent-key.ts',
  request: 'apps/api/src/modules/notification/domain/notification-request.ts',
  outboxStore: 'packages/persistence/src/platform/outbox-event-store.ts',
  apiManifest: 'apps/api/package.json',
  workerManifest: 'apps/worker/package.json',
});

const MIGRATION_COUNT = 34;

/** Dependencies that would mean a provider or a second crypto stack was chosen. */
const FORBIDDEN_PACKAGES = Object.freeze([
  'nodemailer',
  '@sendgrid/mail',
  'twilio',
  'postmark',
  'mailgun.js',
  'resend',
  '@aws-sdk/client-ses',
  '@aws-sdk/client-sns',
  'node-forge',
  'tweetnacl',
  'libsodium-wrappers',
  'jose',
  'crypto-js',
]);

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

const shown = (rootDir, file) =>
  file
    .slice(rootDir.length + 1)
    .split('\\')
    .join('/');
const isTest = (path) => /\.(spec|test|bench)\.ts$/.test(path) || path.includes('/tests/');

/**
 * Source with comments removed.
 *
 * Every rule below is about what the code *does*, and these files document what
 * they deliberately do not do — "`apps/api` seals through it", "deliberately not
 * `openDeliveryEnvelope`", "there is no `NotificationChannelPort`". Scanning raw
 * text makes a gate that fails on its own explanation, and a gate that cries
 * wolf gets deleted. So prose is stripped first, and the assertions read code.
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every module specifier the file imports or requires. */
export function importSpecifiers(source) {
  const code = stripComments(source);
  const found = [];
  for (const pattern of [
    /from\s+'([^']+)'/g,
    /require\(\s*'([^']+)'\s*\)/g,
    /import\(\s*'([^']+)'\s*\)/g,
  ]) {
    for (const match of code.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** 1, 2 — the package exists under the locked name. */
function checkPackage(rootDir, fail) {
  const manifest = read(rootDir, 'packageManifest');
  if (manifest === undefined) {
    fail(`${PACKAGE_DIR} does not exist`);
    return;
  }
  const parsed = JSON.parse(manifest);
  if (parsed.name !== PACKAGE_NAME) {
    fail(`${CANONICAL_FILES.packageManifest}: name is "${String(parsed.name)}"`);
  }

  // 9, 10, 11 — the boundary that makes it a package rather than a shortcut.
  const dependencies = { ...parsed.dependencies, ...parsed.peerDependencies };
  for (const forbidden of ['@embroidery/database', '@embroidery/persistence']) {
    if (dependencies[forbidden] !== undefined) {
      fail(`${PACKAGE_NAME} depends on ${forbidden}; the envelope owns no persistence`);
    }
  }
  for (const name of Object.keys(dependencies)) {
    if (name.startsWith('@embroidery/') && !name.endsWith('-config')) {
      fail(`${PACKAGE_NAME} depends on ${name}; it must stay dependency-free at runtime`);
    }
  }
  for (const file of sourceFiles(rootDir, PACKAGE_DIR)) {
    for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
      const forbidden = [
        'apps/',
        '@embroidery/database',
        '@embroidery/persistence',
        '@nestjs/',
      ].find((needle) => specifier.includes(needle));
      if (forbidden !== undefined) {
        fail(`${shown(rootDir, file)} imports ${specifier}; the package is framework-neutral`);
      }
    }
  }
}

/** 3–8 — one AEAD implementation, owned here, with the locked parameters. */
function checkEnvelope(rootDir, fail) {
  const contract = read(rootDir, 'contract') ?? '';
  const codec = read(rootDir, 'codec') ?? '';
  const key = read(rootDir, 'envelopeKey') ?? '';

  if (!/DELIVERY_ENVELOPE_VERSION\s*=\s*1\b/.test(contract)) {
    fail(`${CANONICAL_FILES.contract}: envelope version is not 1`);
  }
  if (!/DELIVERY_ENVELOPE_ALGORITHM\s*=\s*'AES-256-GCM'/.test(contract)) {
    fail(`${CANONICAL_FILES.contract}: algorithm is not AES-256-GCM`);
  }
  if (
    !/DELIVERY_SECRET_KINDS\s*=\s*\['VERIFICATION_CODE',\s*'SECURE_LINK_TOKEN'\]/.test(contract)
  ) {
    fail(`${CANONICAL_FILES.contract}: the secret-kind set is not the locked pair`);
  }
  if (!codec.includes("'aes-256-gcm'")) {
    fail(`${CANONICAL_FILES.codec}: no aes-256-gcm cipher`);
  }
  if (!codec.includes("from 'node:crypto'")) {
    fail(`${CANONICAL_FILES.codec}: the cipher does not come from node:crypto`);
  }
  if (!/ENVELOPE_IV_BYTES\s*=\s*12\b/.test(codec)) {
    fail(`${CANONICAL_FILES.codec}: the nonce is not 96 bits`);
  }
  if (!/random\(ENVELOPE_IV_BYTES\)/.test(codec)) {
    fail(`${CANONICAL_FILES.codec}: seal does not generate a fresh nonce`);
  }
  if (
    !/ENVELOPE_KEY_BYTES\s*=\s*32\b/.test(key) ||
    !/bytes\.length\s*!==\s*ENVELOPE_KEY_BYTES/.test(key)
  ) {
    fail(`${CANONICAL_FILES.envelopeKey}: the key decoder does not require exactly 32 bytes`);
  }

  // 3 — exactly one AES-GCM implementation in the repository.
  const implementations = [];
  for (const root of ['apps/api/src', 'apps/worker/src', 'packages']) {
    for (const file of sourceFiles(rootDir, root)) {
      const path = shown(rootDir, file);
      if (isTest(path)) continue;
      const source = readFileSync(file, 'utf8');
      if (/aes-256-gcm|createCipheriv|createDecipheriv/.test(source)) implementations.push(path);
    }
  }
  const outside = implementations.filter((path) => !path.startsWith(`${PACKAGE_DIR}/`));
  if (outside.length > 0) {
    fail(`AES-GCM appears outside the shared package: ${outside.join(', ')}`);
  }
  if (implementations.length === 0) {
    fail('no AES-GCM implementation was found at all');
  }
}

/** 12, 13, 14, 15 — composition, the guard, and nothing installed. */
function checkComposition(rootDir, fail) {
  // Composition means the module is in the `imports` array — not merely that its
  // name appears in the file, which an unused import statement also satisfies.
  const appModule = stripComments(read(rootDir, 'appModule') ?? '');
  const importsBlock = /imports:\s*\[([\s\S]*?)\n\s*\]/.exec(appModule)?.[1] ?? '';
  if (!/\bNotificationModule\b/.test(importsBlock)) {
    fail(`${CANONICAL_FILES.appModule}: NotificationModule is not composed`);
  }

  const store = read(rootDir, 'outboxStore') ?? '';
  if (!store.includes("'NOTIFICATION_INTENT'")) {
    fail(`${CANONICAL_FILES.outboxStore}: OUTBOX_AGGREGATE_KINDS lacks NOTIFICATION_INTENT`);
  }
  if (/check\s*\(|CHECK\s+\(/.test(store)) {
    fail(
      `${CANONICAL_FILES.outboxStore}: a CHECK constraint appeared; the guard is application-level`,
    );
  }

  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B01 adds none`);
  }

  for (const key of ['apiManifest', 'workerManifest']) {
    const manifest = read(rootDir, key);
    if (manifest === undefined) continue;
    for (const name of FORBIDDEN_PACKAGES) {
      if (manifest.includes(`"${name}"`)) {
        fail(`${CANONICAL_FILES[key]} gained "${name}"; B01 selects no provider or crypto`);
      }
    }
  }
}

/** 16–22 — the intake behaviour and the boundaries around it. */
function checkIntake(rootDir, fail) {
  const useCaseRaw = read(rootDir, 'useCase') ?? '';
  if (useCaseRaw === '') {
    fail(`${CANONICAL_FILES.useCase} is missing`);
    return;
  }
  const useCase = stripComments(useCaseRaw);

  // 17 — the linkage, written literally.
  if (!/aggregateKind:\s*'NOTIFICATION_INTENT'/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: the delivery event does not set NOTIFICATION_INTENT`);
  }
  if (!/aggregateId:\s*created\.intent\.id/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: aggregateId is not the current intent id`);
  }
  // 20, 21 — seals through the package, and never opens.
  if (
    !/sealDeliveryEnvelope\(/.test(useCase) ||
    !importSpecifiers(useCaseRaw).includes(PACKAGE_NAME)
  ) {
    fail(`${CANONICAL_FILES.useCase}: does not seal through ${PACKAGE_NAME}`);
  }
  if (/openDeliveryEnvelope\(|createDecipheriv\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: the API decrypts; opening belongs to APP4-W01`);
  }
  // 27 — one transaction, not a dual write.
  if (!/runInTransaction/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: intent and outbox append are not in one transaction`);
  }
  // 6 — masking is reused, never re-implemented. Both halves are required: an
  // import alone can survive after the call is replaced by a local helper.
  const useCaseImports = importSpecifiers(useCaseRaw);
  if (
    !/maskContact\(/.test(useCase) ||
    !useCaseImports.some((specifier) => specifier.endsWith('contact/mask-contact'))
  ) {
    fail(`${CANONICAL_FILES.useCase}: does not use the P01 masking authority`);
  }

  // 19 — the reference union carries identifiers and nothing else. Scoped to the
  // type declaration itself, so an unrelated word elsewhere in the file cannot
  // trip it and a real extra member cannot hide behind that noise.
  const request = stripComments(read(rootDir, 'request') ?? '');
  const union = /export type NotificationReference =([\s\S]*?);\n/.exec(request)?.[1] ?? '';
  if (union === '') {
    fail(`${CANONICAL_FILES.request}: no NotificationReference union`);
  }
  for (const forbidden of ['secret', 'ciphertext', 'authTag', 'token', 'code', 'recipient']) {
    if (new RegExp(`\\b${forbidden}`, 'i').test(union)) {
      fail(`${CANONICAL_FILES.request}: the reference union carries "${forbidden}"`);
    }
  }
  if (!/buildIntentParams/.test(request)) {
    fail(`${CANONICAL_FILES.request}: no single params builder`);
  }

  // 18 — nothing queries the ciphertext to find an intent.
  for (const file of sourceFiles(rootDir, 'apps/api/src/modules/notification')) {
    const source = stripComments(readFileSync(file, 'utf8'));
    if (/payload\s*->>|jsonb_extract|payload\s*->\s*'/.test(source)) {
      fail(`${shown(rootDir, file)} queries the outbox payload; the linkage is a column`);
    }
  }

  // 16 — the superseded claim path stays without a production *caller*. The
  // interface and its adapter still declare it; nothing may invoke it.
  for (const file of sourceFiles(rootDir, 'apps/api/src')) {
    const path = shown(rootDir, file);
    if (isTest(path) || path.endsWith('drizzle-notification-intent.repository.ts')) continue;
    if (/\.claimBatch\s*\(/.test(stripComments(readFileSync(file, 'utf8')))) {
      fail(`${path} calls claimBatch; the APP2 outbox runtime is the only queue`);
    }
  }

  // 29 — no delivery capability was added early.
  for (const file of sourceFiles(rootDir, 'apps/api/src/modules/notification')) {
    const source = stripComments(readFileSync(file, 'utf8'));
    if (/\bNotificationChannelPort\b|\bRecordingChannelAdapter\b/.test(source)) {
      fail(`${shown(rootDir, file)} adds a channel port; that is APP4-W01's`);
    }
  }

  // 22 — no app-to-app import in either direction, measured on real specifiers.
  for (const [root, foreign] of [
    ['apps/api/src', 'apps/worker'],
    ['apps/worker/src', 'apps/api'],
  ]) {
    for (const file of sourceFiles(rootDir, root)) {
      // Relative specifiers are resolved before the test: `../../api/src/...`
      // reaches the other app without ever spelling `apps/api`.
      const offending = importSpecifiers(readFileSync(file, 'utf8')).find((specifier) => {
        const target = specifier.startsWith('.')
          ? resolve(dirname(file), specifier).split('\\').join('/')
          : specifier;
        return target.includes(`${foreign}/`) || target.includes(`/${foreign.slice(5)}/src/`);
      });
      if (offending !== undefined) {
        fail(`${shown(rootDir, file)} imports ${offending}; apps never import each other`);
      }
    }
  }
}

/** 23 — no plaintext key, code or token literal was introduced. */
function checkNoLiterals(rootDir, fail) {
  const files = [
    ...sourceFiles(rootDir, PACKAGE_DIR),
    ...sourceFiles(rootDir, 'apps/api/src/modules/notification'),
  ];
  for (const file of files) {
    const path = shown(rootDir, file);
    if (isTest(path)) continue;
    for (const [index, line] of readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
      for (const segment of line.split(/[^A-Za-z0-9+/=_-]+/)) {
        if (segment.length < 24) continue;
        if (!/[a-z]/.test(segment) || !/[A-Z]/.test(segment) || !/\d/.test(segment)) continue;
        fail(`${path}:${String(index + 1)}: a base64-shaped literal appears in production source`);
      }
    }
  }
}

export function checkApp4B01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkPackage(rootDir, fail);
  checkEnvelope(rootDir, fail);
  checkComposition(rootDir, fail);
  checkIntake(rootDir, fail);
  checkNoLiterals(rootDir, fail);
  // APP4-B01-C1 — the publication seam, kept in its own half because it is its
  // own responsibility rather than to chase a line limit.
  checkPolicyPublication(rootDir, stripComments, fail);

  return failures;
}

async function main() {
  const failures = checkApp4B01(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-b01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app4-b01 — ${PACKAGE_NAME} is the single APP4 AES-256-GCM implementation at ` +
      'envelope version 1 with a 96-bit nonce, a 32-byte key and exactly two secret kinds, ' +
      'depending on no app, no database and no persistence; the API seals through it and never ' +
      'opens; NotificationModule is composed; OUTBOX_AGGREGATE_KINDS gained NOTIFICATION_INTENT ' +
      'with no CHECK and no migration; every delivery event carries the current intent id in the ' +
      'clear so nothing queries ciphertext; intent params carry typed references only; and the ' +
      'repository gains no provider, no channel port, no claimBatch caller and no app-to-app import',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
