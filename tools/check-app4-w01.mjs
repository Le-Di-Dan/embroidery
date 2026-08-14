#!/usr/bin/env node
/**
 * `APP4-W01` — the notification delivery worker.
 *
 * The failures this gate exists for are the convenient ones, not the deleted
 * ones. Polling `notification_intents` because DB7 already built a `claimBatch`.
 * Reading `originNotificationIntentId` because on a first delivery it equals the
 * current intent and every fixture passes. Hard-coding `[60, 300]` because the
 * numbers are right there in the ADR. Logging the decrypted payload while
 * debugging a provider that does not exist yet. Resetting a `DEAD_LETTER` row to
 * "just retry it". Each one works, and each one undoes a locked decision.
 *
 * So most assertions are **negations**, and all of them are measured against
 * real source rather than against the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-w01.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';
import {
  CAPABILITY_DIR,
  capabilitySources,
  checkBoundaries,
  checkQueueAndOutbox,
  isTest,
  shown,
  sourceFiles,
} from './check-app4-w01-boundaries.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export { CAPABILITY_DIR };
export const ENVELOPE_PACKAGE = '@embroidery/notification-delivery';
export const ENVELOPE_PACKAGE_DIR = 'packages/notification-delivery';

export const CANONICAL_FILES = Object.freeze({
  handler: `${CAPABILITY_DIR}/notification-delivery.handler.ts`,
  module: `${CAPABILITY_DIR}/notification-delivery.module.ts`,
  useCase: `${CAPABILITY_DIR}/application/notification-delivery.usecase.ts`,
  payload: `${CAPABILITY_DIR}/domain/notification-delivery.payload.ts`,
  policy: `${CAPABILITY_DIR}/domain/notification-delivery-policy.ts`,
  channelPort: `${CAPABILITY_DIR}/domain/channel/notification-channel.port.ts`,
  repositoryPort: `${CAPABILITY_DIR}/domain/repositories/notification-delivery.repository.ts`,
  adapter: `${CAPABILITY_DIR}/infrastructure/channel/recording-notification-channel.adapter.ts`,
  repository: `${CAPABILITY_DIR}/infrastructure/persistence/sql-notification-delivery.repository.ts`,
  policyService: `${CAPABILITY_DIR}/infrastructure/policy/notification-delivery-policy.service.ts`,
  workerModule: 'apps/worker/src/bootstrap/worker.module.ts',
  pollRuntime: 'apps/worker/src/runtime/poll/job-poll-runtime.service.ts',
  workerManifest: 'apps/worker/package.json',
});

export const EVENT_TYPE = 'notification.delivery.requested';
export const POLICY_KEY = 'notification.delivery';
const MIGRATION_COUNT = 34;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** 1, 11 — one handler, one registration, one port. */
function checkRegistration(rootDir, fail) {
  const handler = read(rootDir, 'handler');
  if (handler === undefined) {
    fail(`${CANONICAL_FILES.handler} does not exist`);
    return;
  }
  const code = stripComments(handler);
  if (!/implements JobHandler<[^>]*>/.test(code)) {
    fail(`${CANONICAL_FILES.handler}: does not implement the runtime handler contract`);
  }
  if (!/readonly jobKind = NOTIFICATION_DELIVERY\b/.test(code)) {
    fail(`${CANONICAL_FILES.handler}: does not file evidence under NOTIFICATION_DELIVERY`);
  }

  const payload = stripComments(read(rootDir, 'payload') ?? '');
  if (!payload.includes(`'${EVENT_TYPE}'`)) {
    fail(`${CANONICAL_FILES.payload}: the event type is not ${EVENT_TYPE}`);
  }

  // Exactly one registration, in exactly one module, composed exactly once.
  const registrations = capabilitySources(rootDir).flatMap((file) =>
    [...file.code.matchAll(/registry\.register(?:All)?\(/g)].map(() => file.path),
  );
  if (registrations.length !== 1) {
    fail(`the capability registers ${String(registrations.length)} times; exactly one is allowed`);
  }

  const workerModule = stripComments(read(rootDir, 'workerModule') ?? '');
  const imports = /imports:\s*\[([\s\S]*?)\n\s*\]/.exec(workerModule)?.[1] ?? '';
  const composed = [...imports.matchAll(/\bNotificationDeliveryModule\b/g)].length;
  if (composed !== 1) {
    fail(
      `${CANONICAL_FILES.workerModule}: NotificationDeliveryModule is composed ${String(composed)} times`,
    );
  }

  const port = stripComments(read(rootDir, 'channelPort') ?? '');
  if (
    !/interface NotificationChannelPort\b/.test(port) ||
    !/NOTIFICATION_CHANNEL_PORT/.test(port)
  ) {
    fail(`${CANONICAL_FILES.channelPort}: no provider-neutral NotificationChannelPort`);
  }
  if (!/'EMAIL'/.test(port) || !/'SMS'/.test(port)) {
    fail(`${CANONICAL_FILES.channelPort}: the EMAIL/SMS channel set is not declared`);
  }
}

/** 2, 3, 8, 26 — the envelope package is the only codec, and it is used. */
function checkEnvelopeUse(rootDir, fail) {
  const manifest = JSON.parse(read(rootDir, 'workerManifest') ?? '{}');
  if (manifest.dependencies?.[ENVELOPE_PACKAGE] === undefined) {
    fail(`${CANONICAL_FILES.workerManifest}: the worker does not depend on ${ENVELOPE_PACKAGE}`);
  }

  const useCaseRaw = read(rootDir, 'useCase') ?? '';
  const useCase = stripComments(useCaseRaw);
  if (!importSpecifiers(useCaseRaw).includes(ENVELOPE_PACKAGE)) {
    fail(`${CANONICAL_FILES.useCase}: does not import ${ENVELOPE_PACKAGE}`);
  }
  if (!/openDeliveryEnvelope\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: never calls openDeliveryEnvelope`);
  }

  // 8 — one AEAD implementation, and it is not in the worker.
  const outside = [];
  for (const root of ['apps/api/src', 'apps/worker/src', 'packages']) {
    for (const file of sourceFiles(rootDir, root)) {
      const path = shown(rootDir, file);
      if (isTest(path) || path.startsWith(`${ENVELOPE_PACKAGE_DIR}/`)) continue;
      if (/aes-256-gcm|createCipheriv|createDecipheriv/.test(readFileSync(file, 'utf8'))) {
        outside.push(path);
      }
    }
  }
  if (outside.length > 0) {
    fail(`AES-GCM appears outside ${ENVELOPE_PACKAGE_DIR}: ${outside.join(', ')}`);
  }

  // 26 — the version constant has one owner, and the worker imports it.
  for (const file of capabilitySources(rootDir)) {
    if (/DELIVERY_ENVELOPE_VERSION\s*=/.test(file.code)) {
      fail(`${file.path}: redeclares the envelope version; the package owns it`);
    }
  }
  if (!/DELIVERY_ENVELOPE_VERSION/.test(stripComments(read(rootDir, 'payload') ?? ''))) {
    fail(`${CANONICAL_FILES.payload}: the payload version is not the package's envelope version`);
  }
}

/** 9, 10, 18, 25 — the linkage is the target and no plaintext is persisted. */
function checkLinkageAndPersistence(rootDir, fail) {
  const handler = stripComments(read(rootDir, 'handler') ?? '');
  if (!/context\.aggregateId/.test(handler)) {
    fail(`${CANONICAL_FILES.handler}: the current intent does not come from the aggregate linkage`);
  }
  if (!/context\.aggregateKind\s*!==/.test(handler)) {
    fail(`${CANONICAL_FILES.handler}: a wrong aggregate kind is not rejected`);
  }

  // 10 — the lineage id is never read by production code at all.
  for (const file of capabilitySources(rootDir)) {
    if (/originNotificationIntentId/.test(file.code)) {
      fail(`${file.path}: reads originNotificationIntentId; it is lineage, not the target`);
    }
    // 9 — and nothing goes looking inside the ciphertext for identity.
    if (/payload\s*->>|jsonb_extract|payload\s*->\s*'/.test(file.code)) {
      fail(`${file.path}: queries the outbox payload; the linkage is a column`);
    }
  }

  const repository = stripComments(read(rootDir, 'repository') ?? '');
  if (repository === '') {
    fail(`${CANONICAL_FILES.repository} does not exist`);
    return;
  }
  // 18 — no transition back into the claimable state is expressible.
  // The `SET`, not the `WHERE`: `beginProcessing` legitimately matches a
  // `PENDING` from-state, and a rule that could not tell the two apart would
  // fail on the correct implementation.
  if (/SET\s+status\s*=\s*'PENDING'/i.test(repository)) {
    fail(`${CANONICAL_FILES.repository}: writes an intent back to PENDING; FAILED is terminal`);
  }
  if (!/status IN \('PENDING', 'PROCESSING'\)/.test(repository)) {
    fail(`${CANONICAL_FILES.repository}: the settle write does not guard its from-state`);
  }
  // 25 — the write path has no plaintext-shaped column or binding.
  for (const forbidden of ['secret', 'normalizedRecipient', 'plaintext', 'ciphertext', 'authTag']) {
    if (new RegExp(`\\b${forbidden}\\b`, 'i').test(repository)) {
      fail(`${CANONICAL_FILES.repository}: persists "${forbidden}"`);
    }
  }
  const repositoryPort = stripComments(read(rootDir, 'repositoryPort') ?? '');
  for (const forbidden of ['secret', 'normalizedRecipient', 'ciphertext']) {
    if (new RegExp(`\\b${forbidden}\\b`, 'i').test(repositoryPort)) {
      fail(`${CANONICAL_FILES.repositoryPort}: the persistence contract carries "${forbidden}"`);
    }
  }
}

/** 19, 20, 23 — the policy is read, nothing is restated, failures are bounded. */
function checkPolicyAndErrors(rootDir, fail) {
  const policy = stripComments(read(rootDir, 'policy') ?? '');
  if (!policy.includes(`'${POLICY_KEY}'`)) {
    fail(`${CANONICAL_FILES.policy}: does not name the ${POLICY_KEY} key`);
  }
  const policyService = stripComments(read(rootDir, 'policyService') ?? '');
  if (!/currentValue\(/.test(policyService)) {
    fail(`${CANONICAL_FILES.policyService}: does not read the published policy value`);
  }

  // 20 — no fallback constant anywhere in the capability's production source.
  for (const file of capabilitySources(rootDir)) {
    if (/\b(?:60_000|300_000)\b|\[\s*60\s*,\s*300\s*\]/.test(file.code)) {
      fail(`${file.path}: restates the published retry schedule`);
    }
    if (/maxAttempts\s*[:=]\s*\d/.test(file.code)) {
      fail(`${file.path}: hard-codes an attempt budget`);
    }
  }

  // 23 — the taxonomy is closed and the use case throws nothing else.
  const failures = read(rootDir, `${CAPABILITY_DIR}/domain/delivery-failure.ts`);
  if (failures === undefined) {
    fail(`${CAPABILITY_DIR}/domain/delivery-failure.ts does not exist`);
    return;
  }
  const declared = new Set(
    [...stripComments(failures).matchAll(/'(NOTIFICATION_[A-Z_]+)'/g)].map((match) => match[1]),
  );
  if (declared.size === 0) {
    fail(`${CAPABILITY_DIR}/domain/delivery-failure.ts declares no failure classes`);
  }
  for (const file of capabilitySources(rootDir)) {
    for (const match of file.code.matchAll(/new NotificationDeliveryError\(\s*'([^']+)'/g)) {
      if (!declared.has(match[1])) {
        fail(`${file.path}: throws the undeclared failure class "${match[1]}"`);
      }
    }
  }
}

/** 24 — nothing in the capability logs anything derived from the plaintext. */
function checkNoSecretLogging(rootDir, fail) {
  const forbidden = /\b(secret|token|code|normalizedRecipient|plaintext|payload|ciphertext)\b/i;
  for (const file of capabilitySources(rootDir)) {
    for (const match of file.code.matchAll(/(?:this\.logger\.\w+|console\.\w+)\(([\s\S]*?)\);/g)) {
      const argument = match[1] ?? '';
      if (forbidden.test(argument)) {
        fail(`${file.path}: a log call mentions plaintext-derived material`);
      }
    }
  }
}

/** 27 — W01 is worker-only: no schema, no migration, no HTTP, no UI. */
function checkScope(rootDir, fail) {
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-W01 adds none`);
  }

  for (const file of capabilitySources(rootDir)) {
    for (const needle of [
      '@Controller',
      '@ApiProperty',
      '@ApiResponse',
      'createZodDto',
      '@nestjs/swagger',
    ]) {
      if (file.code.includes(needle)) {
        fail(`${file.path}: ${needle} appears; W01 publishes no HTTP surface`);
      }
    }
  }

  for (const app of ['apps/admin/src', 'apps/storefront/src']) {
    for (const file of sourceFiles(rootDir, app, '.tsx')) {
      if (/notification-delivery|NotificationChannelPort/.test(readFileSync(file, 'utf8'))) {
        fail(`${shown(rootDir, file)} references the delivery capability; W01 ships no UI`);
      }
    }
  }
}

export function checkApp4W01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  // The two files the boundary half needs, read once on this side so it keeps
  // no path table of its own.
  const files = {
    adapter: read(rootDir, 'adapter'),
    pollRuntime: read(rootDir, 'pollRuntime'),
    workerManifest: read(rootDir, 'workerManifest'),
  };

  checkRegistration(rootDir, fail);
  checkEnvelopeUse(rootDir, fail);
  checkBoundaries(rootDir, files, fail);
  checkQueueAndOutbox(rootDir, files, fail);
  checkLinkageAndPersistence(rootDir, fail);
  checkPolicyAndErrors(rootDir, fail);
  checkNoSecretLogging(rootDir, fail);
  checkScope(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4W01(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-w01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app4-w01 — one notification.delivery handler is registered once on the existing ' +
      'outbox runtime, claiming through WorkerJobQueueRepository with no second queue and no ' +
      'claimBatch caller; the current intent comes from the aggregate linkage and the encrypted ' +
      `lineage id is never read; the worker opens through ${ENVELOPE_PACKAGE} and holds no AEAD ` +
      'of its own; the recording adapter is memory-only with no provider, network, database or ' +
      'log sink; the retry budget and schedule are read from the published notification.delivery ' +
      'policy with no fallback constant and no publish path; no plaintext reaches a persisted ' +
      'column or a log line; and no migration, HTTP surface or UI is part of it',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
