#!/usr/bin/env node
/**
 * `APP4-B08` — the **replay-mechanics** half of the gate, plus the file helpers
 * both halves use.
 *
 * Split from `check-app4-b08-contract.mjs` because it is its own
 * responsibility, the same way `check-app4-w01-boundaries.mjs` is: everything
 * here answers *"what does the replay do to the records?"* — which rows it may
 * touch, how it finds its source, what it copies, what it may never open, how it
 * deduplicates, what makes a secret still usable, and who it is attributed to —
 * while the other half answers *"what does the surface publish?"*.
 *
 * The helpers live on this side so the dependency runs one way and neither file
 * imports the other back.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODULE_DIR = 'apps/api/src/modules/notification';

/** The two canonical routes, under the global API prefix. */
export const LIST_PATH = '/api/admin/notification-intents';
export const REPLAY_PATH = '/api/admin/notification-intents/{intentId}/replay';

/** Path → the one verb B08 owns on it. A second verb is a new operation. */
export const ROUTE_VERBS = Object.freeze([
  [LIST_PATH, 'get'],
  [REPLAY_PATH, 'post'],
]);

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export const CANONICAL_FILES = Object.freeze({
  controller: `${MODULE_DIR}/presentation/admin-notification-intent.controller.ts`,
  response: `${MODULE_DIR}/presentation/schemas/admin-notification-intent.response.ts`,
  request: `${MODULE_DIR}/presentation/schemas/admin-notification-intent.request.ts`,
  query: `${MODULE_DIR}/application/admin-notification-intent.query.ts`,
  replayUseCase: `${MODULE_DIR}/application/replay-notification-delivery.use-case.ts`,
  eligibility: `${MODULE_DIR}/application/replay-eligibility.resolver.ts`,
  recorder: `${MODULE_DIR}/application/notification-replay-audit.recorder.ts`,
  replayKey: `${MODULE_DIR}/domain/replay/manual-replay-key.ts`,
  reference: `${MODULE_DIR}/domain/replay/replay-reference.ts`,
  errors: `${MODULE_DIR}/domain/replay/manual-replay.errors.ts`,
  policy: `${MODULE_DIR}/domain/replay/admin-notification.policy.ts`,
  module: `${MODULE_DIR}/notification-admin.module.ts`,
  repositoryPort: `${MODULE_DIR}/domain/repositories/notification-intent.repository.ts`,
  repositoryAdapter: `${MODULE_DIR}/infrastructure/persistence/drizzle-notification-intent.repository.ts`,
  intake: `${MODULE_DIR}/application/request-notification.use-case.ts`,
  outboxStore: 'packages/persistence/src/platform/outbox-event-store.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
});

/** Every file `APP4-B08` owns. The whole surface the source rules read. */
export const B08_SOURCES = Object.freeze([
  CANONICAL_FILES.controller,
  CANONICAL_FILES.response,
  CANONICAL_FILES.request,
  CANONICAL_FILES.query,
  CANONICAL_FILES.replayUseCase,
  CANONICAL_FILES.eligibility,
  CANONICAL_FILES.recorder,
  CANONICAL_FILES.replayKey,
  CANONICAL_FILES.reference,
  CANONICAL_FILES.errors,
  CANONICAL_FILES.policy,
  CANONICAL_FILES.module,
]);

/**
 * The B07 world plus exactly B08's two. Measured, not assumed.
 *
 * The B07 baseline moved from 50 to 51 when the Product Owner's `APP4-A01`
 * authority unblock added B07's exact-contact resolver. B08's own delta is
 * unchanged and still exactly two — the whole point of restating the baseline
 * rather than raising the total is that this rule keeps catching a *third* B08
 * operation.
 */
export const B07_BASELINE_OPERATIONS = 51;
export const EXPECTED_OPERATIONS = 53;
export const MIGRATION_COUNT = 34;

export const ADMIN_GUARD = 'AuthenticatedAdminGuard';
export const ADMIN_SECURITY_SCHEME = 'adminSession';
export const NO_STORE = 'no-store';

/** The locked canonical replay-key input (IMP-D049 PO-11). */
const REPLAY_KEY_PREFIX = 'app4-manual-replay:v1';

/** The delivery event type both the source and the replay carry. */
const DELIVERY_EVENT_TYPE = 'notification.delivery.requested';

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

export function codeOf(rootDir, key) {
  const raw = read(rootDir, key);
  return raw === undefined ? '' : stripComments(raw);
}

export function sources(rootDir, list = B08_SOURCES) {
  return list
    .map((relative) => ({ path: relative, raw: read(rootDir, relative) ?? '' }))
    .filter((file) => file.raw !== '')
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

export function loadOpenApi(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return undefined;
  }
  return JSON.parse(raw);
}

export function methodsOf(document, path) {
  return HTTP_METHODS.filter((method) => document.paths?.[path]?.[method] !== undefined);
}

/** 14, 15, 16, 19, 22, 23 — the replay transaction preserves both terminals. */
export function checkReplayTransaction(rootDir, fail) {
  const useCase = codeOf(rootDir, 'replayUseCase');

  // 14 — the origin must be terminal-failed, checked under a lock.
  if (!/lockById\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not lock the origin intent`);
  }
  if (!/status\s*!==\s*TERMINAL_FAILED|status\s*!==\s*'FAILED'/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not require the origin intent to be FAILED`);
  }
  if (!/runInTransaction/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: the replay is not one transaction`);
  }

  // 15, 16 — neither terminal record is written. Any settle, status write or
  // dead-letter reset would do it.
  for (const forbidden of [
    'markFailed',
    'markDelivered',
    'markDispatched',
    'markDeadLetter',
    'scheduleRetry',
    'claimBatch',
    'recordAttempt',
  ]) {
    if (new RegExp(`\\.${forbidden}\\s*\\(`).test(useCase)) {
      fail(
        `${CANONICAL_FILES.replayUseCase}: calls ${forbidden}; both terminal records are frozen`,
      );
    }
  }
  for (const file of sources(rootDir)) {
    // Drizzle-shaped writes only. A bare `.update(` would also match
    // `createHash(...).update(...)`, which is the non-secret replay key.
    if (
      /\b(?:db|tx)\.update\(|\b(?:db|tx)\.delete\(|update\(\s*(?:notificationIntents|outboxEvents)\b/.test(
        file.code,
      ) ||
      /UPDATE\s+outbox_events|UPDATE\s+notification_intents/i.test(file.code)
    ) {
      fail(`${file.path}: writes to an existing row; B08 appends and never mutates`);
    }
    if (/attempt_count|attemptCount|nextAttemptAt|next_attempt_at/.test(file.code)) {
      fail(`${file.path}: touches an attempt counter or schedule; the worker owns both`);
    }
  }

  // 19, 22 — one new intent through the existing idempotent create, and one new
  // event appended.
  if (!/createIdempotent\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not create the replay intent idempotently`);
  }
  if (!/outbox\.append\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not append the replay outbox event`);
  }

  // 23 — the new event names the **new** intent. Linking it back to the origin
  // would leave the worker updating a terminal record.
  if (!/aggregateId:\s*created\.intent\.id/.test(useCase)) {
    fail(
      `${CANONICAL_FILES.replayUseCase}: the replay event's aggregateId is not the replay intent`,
    );
  }
  if (/aggregateId:\s*origin\./.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: links the replay event back to the origin intent`);
  }
  if (!/aggregateKind:\s*'NOTIFICATION_INTENT'/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: the replay event uses a different aggregate kind`);
  }
}

/** 17, 18, 24, 25 — the source is found by linkage and copied opaquely. */
export function checkSourceLookupAndCopy(rootDir, fail) {
  const useCase = codeOf(rootDir, 'replayUseCase');
  const store = codeOf(rootDir, 'outboxStore');

  // 17 — the lookup is the polymorphic linkage plus type and status.
  if (!/listTerminalEventsForAggregate\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not resolve the source through the linkage read`);
  }
  const lookup = /async\s+listTerminalEventsForAggregate\([\s\S]*?\n {2}}/.exec(store)?.[0] ?? '';
  if (lookup === '') {
    fail(`${CANONICAL_FILES.outboxStore}: no listTerminalEventsForAggregate implementation`);
  } else {
    for (const predicate of ['aggregateKind', 'aggregateId', 'eventType', 'status']) {
      if (!new RegExp(`outboxEvents\\.${predicate}`).test(lookup)) {
        fail(`${CANONICAL_FILES.outboxStore}: the source lookup does not filter on ${predicate}`);
      }
    }
    if (!/'DEAD_LETTER'/.test(lookup)) {
      fail(`${CANONICAL_FILES.outboxStore}: the source lookup does not require DEAD_LETTER`);
    }
    // 18 — never by content.
    if (/payload\s*->|jsonb|sql`[^`]*payload/i.test(lookup)) {
      fail(`${CANONICAL_FILES.outboxStore}: the source lookup queries the payload`);
    }
  }

  // 18 — and nothing in B08 queries ciphertext or reads a field *out of* the
  // envelope.
  //
  // `originNotificationIntentId` is matched only as a **property read on a
  // payload**, not as a bare identifier: it is also the name of the replay key's
  // own input, which is the non-secret origin intent the operator named. The
  // encrypted one and the key input are the same concept seen from two sides,
  // and only one of them requires opening anything.
  for (const file of sources(rootDir)) {
    if (
      /payload\s*->|->>\s*'payload'|ciphertext/i.test(file.code) ||
      /(?:payload|envelope|opened|decrypted)\s*(?:\.|\[')\s*originNotificationIntentId/i.test(
        file.code,
      )
    ) {
      fail(`${file.path}: reads or queries envelope content; the payload is opaque here`);
    }
  }

  // 24, 25 — the payload and its version are copied from the source, unchanged.
  //
  // Read from the **append call itself**, not from the file: the same two field
  // names also appear on the private source-read's return, so a file-wide scan
  // would keep passing after the append site had been changed to re-seal.
  const appendCall = /outbox\.append\(\{([\s\S]*?)\}\)/.exec(useCase)?.[1] ?? '';
  if (appendCall === '') {
    fail(`${CANONICAL_FILES.replayUseCase}: no outbox append call to inspect`);
  } else {
    if (!/payload:\s*source\.payload/.test(appendCall)) {
      fail(`${CANONICAL_FILES.replayUseCase}: does not copy the source payload verbatim`);
    }
    if (!/payloadSchemaVersion:\s*source\.payloadSchemaVersion/.test(appendCall)) {
      fail(`${CANONICAL_FILES.replayUseCase}: does not copy the source payload schema version`);
    }
    if (
      !new RegExp(`eventType:\\s*NOTIFICATION_DELIVERY_EVENT_TYPE|'${DELIVERY_EVENT_TYPE}'`).test(
        appendCall,
      )
    ) {
      fail(
        `${CANONICAL_FILES.replayUseCase}: the replay event type is not the delivery event type`,
      );
    }
  }
}

/** 26, 27, 28 — no decrypt, no seal, no secret minting, anywhere in B08. */
export function checkNoSecretHandling(rootDir, fail) {
  for (const file of sources(rootDir)) {
    for (const symbol of [
      'openDeliveryEnvelope',
      'sealDeliveryEnvelope',
      'createDecipheriv',
      'createCipheriv',
      'issueVerificationCode',
      'issueSecureLinkToken',
      'VerificationCodeMinter',
      'SecureLinkTokenMinter',
      'digestSecret',
      'createHmac',
    ]) {
      if (new RegExp(`\\b${symbol}\\b`).test(file.code)) {
        fail(`${file.path}: uses ${symbol}; B08 never opens, seals or mints`);
      }
    }
    // The AEAD package is not imported at all — the structural half of "the API
    // never decrypts". `createHash` for the non-secret replay key is allowed and
    // is asserted separately below.
    for (const specifier of importSpecifiers(file.code)) {
      // The **package**, matched exactly. A substring test would also flag
      // `replay-notification-delivery.use-case`, which is B08's own file.
      if (specifier === '@embroidery/notification-delivery') {
        fail(`${file.path}: imports "${specifier}"; B08 holds no envelope symbol`);
      }
    }
  }

  // The module composes no envelope key provider either.
  const moduleCode = codeOf(rootDir, 'module');
  if (/DeliveryEnvelopeKeyProvider/.test(moduleCode)) {
    fail(`${CANONICAL_FILES.module}: composes the envelope key; B08 has no reason to hold it`);
  }
}

/** 20, 21 — the locked deterministic replay key, and no second framework. */
export function checkReplayKey(rootDir, fail) {
  const key = codeOf(rootDir, 'replayKey');

  if (!new RegExp(`'${REPLAY_KEY_PREFIX}'`).test(key)) {
    fail(`${CANONICAL_FILES.replayKey}: does not use the locked "${REPLAY_KEY_PREFIX}" prefix`);
  }
  if (!/createHash\('sha256'\)/.test(key)) {
    fail(`${CANONICAL_FILES.replayKey}: is not a SHA-256 digest`);
  }
  if (!/digest\('hex'\)/.test(key)) {
    fail(`${CANONICAL_FILES.replayKey}: does not render the digest as hex`);
  }
  if (!/originNotificationIntentId/.test(key) || !/deadLetterOutboxEventId/.test(key)) {
    fail(`${CANONICAL_FILES.replayKey}: the canonical input is not the locked pair`);
  }
  // Anything that varies per call defeats the deduplication the key exists for.
  for (const forbidden of ['Date', 'now', 'random', 'adminId', 'requestId', 'nonce', 'uuid']) {
    if (new RegExp(`\\b${forbidden}\\b`, 'i').test(key)) {
      fail(`${CANONICAL_FILES.replayKey}: names "${forbidden}"; the key must not vary per call`);
    }
  }

  // 21 — the idempotency is the existing `intent_key` uniqueness.
  const useCase = codeOf(rootDir, 'replayUseCase');
  if (!/deriveManualReplayIntentKey\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not derive the locked replay key`);
  }
  for (const file of sources(rootDir)) {
    if (/IdempotencyStore|idempotency_keys|allocateIdempotency/i.test(file.code)) {
      fail(`${file.path}: introduces a second idempotency framework`);
    }
  }
}

/** 29, 30, 31 — eligibility reads a typed reference and routes the refusal. */
export function checkEligibility(rootDir, fail) {
  const resolver = codeOf(rootDir, 'eligibility');
  const useCase = codeOf(rootDir, 'replayUseCase');
  const errors = codeOf(rootDir, 'errors');
  const reference = codeOf(rootDir, 'reference');

  // 29, 30 — both aggregates are resolved through their delivered ports.
  if (!/VERIFICATION_CHALLENGE_REPOSITORY/.test(resolver)) {
    fail(`${CANONICAL_FILES.eligibility}: does not read the verification challenge port`);
  }
  if (!/SECURE_ACCESS_GRANT_REPOSITORY/.test(resolver)) {
    fail(`${CANONICAL_FILES.eligibility}: does not read the secure grant port`);
  }
  if (!/'ISSUED'/.test(resolver) || !/'ACTIVE'/.test(resolver)) {
    fail(`${CANONICAL_FILES.eligibility}: does not require a live challenge and a live grant`);
  }
  // Both branches compare the deadline, counted rather than merely present: one
  // `expiresAt` anywhere in the file would keep passing after the other
  // aggregate's check had been deleted, which is how a dead link gets re-sent.
  const expiryChecks = resolver.match(/expiresAt\.getTime\(\)\s*>\s*now\.getTime\(\)/g) ?? [];
  if (expiryChecks.length < 2) {
    fail(
      `${CANONICAL_FILES.eligibility}: enforces expiry on ${String(expiryChecks.length)} of 2 ` +
        'referenced aggregates',
    );
  }
  // It reads state, never a stored secret.
  for (const forbidden of ['codeHash', 'code_hash', 'tokenHash', 'token_hash', 'findCodeDigest']) {
    if (new RegExp(forbidden, 'i').test(resolver)) {
      fail(
        `${CANONICAL_FILES.eligibility}: reads "${forbidden}"; eligibility is state, not secret`,
      );
    }
  }

  // 29, 30 — the reference comes from the secret-free params contract, and is
  // never guessed from a template name or found by probing tables.
  if (!/readNotificationReference\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not read the typed reference from params`);
  }
  if (!/schemaVersion/.test(reference)) {
    fail(`${CANONICAL_FILES.reference}: does not check the params schema version`);
  }
  if (/templateKey/.test(reference)) {
    fail(`${CANONICAL_FILES.reference}: infers the reference from the template`);
  }

  // 31 — the routing signal exists and is not spent on a state conflict.
  if (!/'REISSUE_REQUIRED'/.test(errors)) {
    fail(`${CANONICAL_FILES.errors}: publishes no REISSUE_REQUIRED refusal`);
  }
  if (!/REISSUE_REQUIRED[\s\S]{0,200}CONFLICT/.test(errors)) {
    fail(`${CANONICAL_FILES.errors}: REISSUE_REQUIRED is not a conflict`);
  }
  if (!/isReplayable[\s\S]{0,120}REISSUE_REQUIRED/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: an ineligible secret does not map to REISSUE_REQUIRED`);
  }
  if (/REPLAY_NOT_APPLICABLE[\s\S]{0,80}REISSUE_REQUIRED/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: a state conflict answers with the reissue signal`);
  }
}

/** 32, 33 — the audit names the Admin and no secret. */
export function checkAudit(rootDir, fail) {
  const recorder = codeOf(rootDir, 'recorder');
  const useCase = codeOf(rootDir, 'replayUseCase');

  if (!/requireActor\s*\(\s*\)/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: does not resolve the actor from the request context`);
  }
  if (!/kind\s*!==\s*'ADMIN'/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: does not refuse a non-Admin actor`);
  }
  if (/'SYSTEM'|'CUSTOMER'/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: admits a non-Admin actor kind`);
  }
  if (!/recordReplayed\s*\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.replayUseCase}: does not audit the replay`);
  }
  // 33 — the summary carries ids and the fixed operation, nothing else.
  const summary = /summary:\s*\{([\s\S]*?)\n {6}\}/.exec(recorder)?.[1] ?? '';
  for (const forbidden of [
    'recipient',
    'params',
    'payload',
    'template',
    'secret',
    'code',
    'token',
    'digest',
    'envelope',
  ]) {
    if (new RegExp(forbidden, 'i').test(summary)) {
      fail(`${CANONICAL_FILES.recorder}: the audit summary names "${forbidden}"`);
    }
  }
}
