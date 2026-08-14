#!/usr/bin/env node
/**
 * `APP4-B04` — the verification submit/status contract.
 *
 * The failures this gate exists for are the ones that look like progress:
 * comparing the code with `===` because the digest is already a string;
 * defaulting `maxAttempts` to five so the endpoint works before the policy is
 * published, which is a lockout rule nobody versioned; adding
 * `attemptsRemaining` to be helpful, which meters an attacker's budget; letting
 * the status GET sweep the row it found expired, which hands lifecycle
 * transitions to anyone able to poll; returning the customer id, which turns a
 * challenge id into a lookup into the identity graph; issuing the grant right
 * there, because the customer is in hand. Each one works, and each one breaks
 * something locked.
 *
 * Assertions read the **generated OpenAPI document** and **real source with
 * comments stripped** — never prose, and never the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b04-contract.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';
import {
  ATTEMPT_PATH,
  ISSUE_PATH,
  MODULE_DIR,
  RESEND_PATH,
  SECURE_LINK_RESOLVE_PATH,
  STATUS_PATH,
} from './check-app4-b03-contract.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export { ATTEMPT_PATH, STATUS_PATH };

export const CANONICAL_FILES = Object.freeze({
  controller: `${MODULE_DIR}/presentation/public-verification.controller.ts`,
  request: `${MODULE_DIR}/presentation/schemas/verification-attempt.request.ts`,
  response: `${MODULE_DIR}/presentation/schemas/verification-challenge-status.response.ts`,
  useCase: `${MODULE_DIR}/application/submit-verification-attempt.use-case.ts`,
  statusQuery: `${MODULE_DIR}/application/read-verification-challenge-status.query.ts`,
  recorder: `${MODULE_DIR}/application/verification-outcome-audit.recorder.ts`,
  outcome: `${MODULE_DIR}/domain/verification/verification-attempt-outcome.ts`,
  errors: `${MODULE_DIR}/domain/verification/verification-attempt-http.errors.ts`,
  evidence: `${MODULE_DIR}/domain/verification/challenge-verified-evidence.ts`,
  repositoryPort: `${MODULE_DIR}/domain/repositories/verification-challenge.repository.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

/** Every file `APP4-B04` owns or shares. The whole surface the rules read. */
export const B04_SOURCES = Object.freeze([
  CANONICAL_FILES.controller,
  CANONICAL_FILES.request,
  CANONICAL_FILES.response,
  CANONICAL_FILES.useCase,
  CANONICAL_FILES.statusQuery,
  CANONICAL_FILES.recorder,
  CANONICAL_FILES.outcome,
  CANONICAL_FILES.errors,
  CANONICAL_FILES.evidence,
]);

/** The closed TBL-007 outcome set. Nothing else may be appended. */
const ATTEMPT_OUTCOMES = ['MATCH', 'MISMATCH', 'EXPIRED_AT_ENTRY'];

/**
 * The published operation count, measured rather than assumed.
 *
 * 46 at B04's closure — the entry world plus exactly B04's two. Now 47: the one
 * `APP4-B06` added. The number is restated rather than removed, because its job
 * is to catch an *unintended* operation appearing beside B04's pair, and a rule
 * that stopped counting would stop doing that.
 */
const EXPECTED_OPERATIONS = 47;
const MIGRATION_COUNT = 34;

/** `APP4-G01`'s attempt budget. Lives in the policy store, never in source. */
const MAX_ATTEMPTS = 5;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Owned sources as `{ path, raw, code }` with prose removed. */
function sources(rootDir) {
  return B04_SOURCES.map((relative) => ({
    path: relative,
    raw: read(rootDir, relative) ?? '',
  }))
    .filter((file) => file.raw !== '')
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

function loadOpenApi(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return undefined;
  }
  return JSON.parse(raw);
}

function checkFilesExist(rootDir, fail) {
  for (const relative of B04_SOURCES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} does not exist`);
    }
  }
}

/** 1, 2, 3, 4, 25 — the published surface is exactly two new operations. */
function checkPublishedSurface(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  const methodsOf = (path) =>
    methods.filter((method) => document.paths?.[path]?.[method] !== undefined);

  // 1, 2 — B04's pair, at the canonical routes, with no other verb.
  if (JSON.stringify(methodsOf(ATTEMPT_PATH)) !== JSON.stringify(['post'])) {
    fail(`${ATTEMPT_PATH} publishes [${methodsOf(ATTEMPT_PATH).join(', ')}]; expected one POST`);
  }
  if (JSON.stringify(methodsOf(STATUS_PATH)) !== JSON.stringify(['get'])) {
    fail(`${STATUS_PATH} publishes [${methodsOf(STATUS_PATH).join(', ')}]; expected one GET`);
  }

  // 3 — B03 is preserved, not replaced.
  for (const path of [ISSUE_PATH, RESEND_PATH]) {
    if (JSON.stringify(methodsOf(path)) !== JSON.stringify(['post'])) {
      fail(`${path}: the APP4-B03 operation is missing or changed verb`);
    }
  }

  // 1 — and there is no third B04 route hiding elsewhere.
  const verificationPaths = Object.keys(document.paths ?? {}).filter((path) =>
    /verification/i.test(path),
  );
  if (verificationPaths.length !== 4) {
    fail(`the verification surface has ${String(verificationPaths.length)} paths; expected four`);
  }

  // 4, 26 — no grant surface, and no business operation from a later phase.
  //
  // `APP4-B06` published one secure-link resolver, so the blanket ban is stated
  // as the current world: that exact path with that exact verb is authorized,
  // and everything else matching still fails.
  for (const path of Object.keys(document.paths ?? {})) {
    if (path === SECURE_LINK_RESOLVE_PATH) {
      if (JSON.stringify(methodsOf(path)) !== JSON.stringify(['post'])) {
        fail(`${path} publishes [${methodsOf(path).join(', ')}]; APP4-B06 owns one POST`);
      }
      continue;
    }
    if (/grant|secure-link|step-up|stepup/i.test(path)) {
      fail(`${path} looks like an APP4-B05 grant route; grants have no public surface`);
    }
    if (/custom-request|quotation|design-case|payment|refund|order(s)?\b/i.test(path)) {
      fail(`${path} is an APP5/APP6/APP7 business operation; B04 publishes none`);
    }
  }

  // 25 — the delta is exactly two operations over the accepted B03 world.
  const total = Object.keys(document.paths ?? {}).reduce(
    (count, path) => count + methodsOf(path).length,
    0,
  );
  if (total !== EXPECTED_OPERATIONS) {
    fail(
      `the document publishes ${String(total)} operations; expected ${String(EXPECTED_OPERATIONS)}`,
    );
  }
}

/** 5, 6, 7 — the attempt body is a code and nothing else. */
function checkAttemptBody(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  const body = document.components?.schemas?.SubmitVerificationAttemptBody;
  if (body === undefined) {
    fail('SubmitVerificationAttemptBody is not published as a component');
    return;
  }

  const fields = Object.keys(body.properties ?? {}).sort();
  if (JSON.stringify(fields) !== JSON.stringify(['code'])) {
    fail(`the attempt body publishes [${fields.join(', ')}]; expected exactly [code]`);
  }
  if (body.additionalProperties !== false) {
    fail('the attempt body accepts unknown properties; it must be strict');
  }

  // 6 — six decimal characters, as a string. A `number` would eat a leading zero.
  const code = body.properties?.code ?? {};
  if (code.type !== 'string') {
    fail(`the submitted code is published as "${String(code.type)}"; it must be a string`);
  }
  if (code.pattern !== '^[0-9]{6}$') {
    fail(`the submitted code pattern is ${JSON.stringify(code.pattern)}; expected ^[0-9]{6}$`);
  }

  // 7 — nothing a caller could use to redirect, re-purpose or assert identity.
  for (const forbidden of [
    'contact',
    'purpose',
    'customer',
    'session',
    'contactPoint',
    'grant',
    'expires',
  ]) {
    if (fields.some((field) => new RegExp(forbidden, 'i').test(field))) {
      fail(`the attempt body carries a "${forbidden}" field; it comes from the challenge`);
    }
  }
}

/** 8, 9, 10 — the two responses disclose state and expiry, and nothing else. */
function checkPublishedResponses(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  const status = document.components?.schemas?.VerificationChallengeStatusResponse;
  if (status === undefined) {
    fail('VerificationChallengeStatusResponse is referenced but not published as a component');
    return;
  }

  // 9 — exactly the three fields, and the state set is LC-02.
  const fields = Object.keys(status.properties ?? {}).sort();
  if (JSON.stringify(fields) !== JSON.stringify(['challengeId', 'expiresAt', 'state'])) {
    fail(
      `the status response publishes [${fields.join(', ')}]; expected challengeId/state/expiresAt`,
    );
  }
  const states = status.properties?.state?.enum;
  const expectedStates = ['ISSUED', 'VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED'];
  if (JSON.stringify(states) !== JSON.stringify(expectedStates)) {
    fail(`the published state set is ${JSON.stringify(states)}`);
  }

  // 8, 10 — nothing about the secret, the destination, the identity or the ledger.
  for (const field of fields) {
    if (
      /^code$|secret|hash|token|contact(?!.*Id$)|customer|session|attempt|purpose|mask/i.test(field)
    ) {
      fail(`the status response exposes "${field}"`);
    }
  }
  const serialized = JSON.stringify(status);
  for (const forbidden of ['codeHash', 'attemptsRemaining', 'attemptCount', 'customerId']) {
    if (serialized.includes(forbidden)) {
      fail(`the status response carries "${forbidden}"`);
    }
  }
}

/** 11, 12 — one verifier, and it is P01's. */
function checkVerifierReuse(rootDir, fail) {
  const useCase = stripComments(read(rootDir, 'useCase') ?? '');
  if (useCase === '') {
    fail(`${CANONICAL_FILES.useCase} does not exist`);
    return;
  }
  if (!/verifySecretDigest\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not compare through the P01 constant-time verifier`);
  }
  if (!/verificationCodePepper/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not pepper the comparison`);
  }

  for (const file of sources(rootDir)) {
    // 12 — no second digest, no second comparison, no password KDF, and no
    // plain equality against a stored digest.
    for (const [pattern, why] of [
      [/createHmac\(|createHash\(|timingSafeEqual\(/, 'implements a second digest or comparison'],
      [/\bscrypt|\bpbkdf2|\bbcrypt|\bargon2/i, 'introduces a password KDF'],
      [/codeHash\s*===|===\s*codeHash|digest\s*===|===\s*digest/, 'compares a digest with =='],
      [/localeCompare\(.*digest|digest.*\.includes\(/, 'compares a digest by string search'],
    ]) {
      if (pattern.test(file.code)) {
        fail(`${file.path}: ${why}`);
      }
    }
  }
}

/** 13, 14, 16 — the budget comes from the published policy and from rows. */
function checkAttemptBudget(rootDir, fail) {
  const useCase = stripComments(read(rootDir, 'useCase') ?? '');

  // 13 — read at the point of use, through the delivered reader.
  if (!/this\.policies\.require\(\)/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not read the published verification policy`);
  }
  if (!/policy\.maxAttempts/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not consume maxAttempts from the policy`);
  }
  // The budget is derived from the append-only ledger, never from a field.
  if (!/countAttempts\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not derive the budget from the attempt ledger`);
  }

  for (const file of sources(rootDir)) {
    // 14 — no fallback constant, in any of its disguises.
    for (const [pattern, why] of [
      [/maxAttempts\s*[:=]\s*\d/, 'hard-codes the attempt budget'],
      [/maxAttempts\s*\?\?/, 'falls back when the policy is missing'],
      [
        new RegExp(`\\b${String(MAX_ATTEMPTS)}\\b`),
        `restates the policy value ${String(MAX_ATTEMPTS)}`,
      ],
      [/ttlSeconds\s*[:=]\s*\d|resendCooldownSeconds\s*[:=]\s*\d/, 'hard-codes a policy duration'],
    ]) {
      if (pattern.test(file.code)) {
        fail(`${file.path}: ${why}`);
      }
    }

    // 16 — no counter, no lockout field, no invented state.
    for (const invented of [
      'attemptCount',
      'attempt_count',
      'failedAttempts',
      'lockedUntil',
      'locked_until',
      'lockoutExpiresAt',
      'nextAttemptAt',
    ]) {
      if (file.code.includes(invented)) {
        fail(`${file.path}: invents "${invented}"; TBL-007 stores no counter and no lockout`);
      }
    }
  }
}

/** 15, 23 — the outcome vocabulary and the terminal-replay branch. */
function checkAttemptStateMachine(rootDir, fail) {
  const useCase = stripComments(read(rootDir, 'useCase') ?? '');

  // 15 — every appended outcome is one of the three TBL-007 allows.
  const appended = [...useCase.matchAll(/recordAttempt\(\s*[^,]+,\s*'([A-Z_]+)'/g)].map(
    (match) => match[1],
  );
  if (appended.length === 0) {
    fail(`${CANONICAL_FILES.useCase}: appends no attempt row`);
  }
  for (const outcome of appended) {
    if (!ATTEMPT_OUTCOMES.includes(outcome)) {
      fail(`${CANONICAL_FILES.useCase}: appends "${outcome}"; TBL-007 allows only the three`);
    }
  }
  for (const required of ATTEMPT_OUTCOMES) {
    if (!appended.includes(required)) {
      fail(`${CANONICAL_FILES.useCase}: never appends ${required}`);
    }
  }

  // 23 — a terminal challenge is refused explicitly, before anything is written.
  if (!/status\s*!==\s*'ISSUED'/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not refuse a non-ISSUED challenge explicitly`);
  }
  // Expiry is decided before the comparison, and the transition is real.
  if (!/expiresAt/.test(useCase) || !/expireStale\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not enforce expiry at entry`);
  }
  if (!/failChallenge\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: never transitions a locked-out challenge to FAILED`);
  }
  // Single use is the database's guarded transition, not a local flag.
  if (!/completeChallenge\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not complete through the guarded transition`);
  }
  if (/Mutex|semaphore|globalThis\.__|static\s+\w+\s*=\s*new Set/i.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: guards single use with process-local state`);
  }
  // The race is serialized by the delivered advisory lock.
  if (!/lockTarget\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not serialize attempts for the target`);
  }
}

/** 17, 18 — SUBMISSION establishes identity; STEP_UP establishes nothing. */
function checkPurposeEffects(rootDir, fail) {
  const useCase = stripComments(read(rootDir, 'useCase') ?? '');

  // 17 — the accepted B02 service, called for SUBMISSION, in this transaction.
  if (
    !/ResolveOrCreateVerifiedCustomer/.test(useCase) ||
    !/this\.identities\.resolve\(/.test(useCase)
  ) {
    fail(`${CANONICAL_FILES.useCase}: does not resolve identity through APP4-B02`);
  }
  if (!/purpose\s*===\s*'SUBMISSION'/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not branch the identity effect on the purpose`);
  }
  if (!/runInTransaction\(/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: the consumption path has no transaction`);
  }
  // The retry is bounded, and the bound is *applied* — a named constant nothing
  // compares against is decoration.
  if (!/pass\s*>=\s*MAX_PASSES/.test(useCase) || !/const MAX_PASSES = \d/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: the concurrency recovery is not bounded`);
  }

  const evidence = stripComments(read(rootDir, 'evidence') ?? '');
  // The contact comes from the challenge and is re-derived through P01, never
  // rebuilt by hand and never taken from the request.
  if (!/normalizeEmail\(|normalizePhone\(/.test(evidence)) {
    fail(`${CANONICAL_FILES.evidence}: does not re-derive the contact through the P01 normalizers`);
  }
  if (!/normalized\s*!==\s*challenge\.normalizedValue/.test(evidence)) {
    fail(`${CANONICAL_FILES.evidence}: does not check normalization is a fixed point`);
  }

  for (const file of sources(rootDir)) {
    // 18 — no grant, no token, no business action, from either purpose.
    for (const [pattern, why] of [
      [
        /SECURE_ACCESS_GRANT|issueSecureLinkToken|secure_access_grants|SecureGrantIssuer/,
        'touches a grant',
      ],
      [/StepUpWindow/, 'implements the B05 step-up window'],
      [/custom_requests|CustomRequestRepository|createCustomRequest/, 'creates an APP5 request'],
      [/quotation|design_case|payment_obligation/i, 'reaches an APP6/APP7 aggregate'],
    ]) {
      if (pattern.test(file.code)) {
        fail(`${file.path}: ${why}`);
      }
    }
  }
}

/** 19, 20 — B04 delivers nothing and mints nothing. */
function checkNoIssuanceOrDelivery(rootDir, fail) {
  for (const file of sources(rootDir)) {
    for (const [pattern, why] of [
      [/RequestNotificationUseCase|this\.notifications\.request\(/, 'requests a notification'],
      [/sealDeliveryEnvelope|openDeliveryEnvelope|createCipheriv/, 'handles a delivery envelope'],
      [/appendOutbox|outbox_events|OutboxEventStore/, 'appends an outbox event'],
      [/openChallenge\(|this\.issuer\.issue\(/, 'issues a challenge; that is B03'],
      [/this\.minter\.mint\(\)|issueVerificationCode\(|randomInt\(/, 'mints a code'],
      [/cancelChallenge\(/, 'cancels a challenge; that is the B03 resend'],
    ]) {
      if (pattern.test(file.code)) {
        fail(`${file.path}: ${why}`);
      }
    }
  }
}

/** 22 — the audit trail carries no secret and no contact value. */
function checkAuditEvidence(rootDir, fail) {
  const recorder = stripComments(read(rootDir, 'recorder') ?? '');
  if (recorder === '') {
    fail(`${CANONICAL_FILES.recorder} does not exist`);
    return;
  }

  // The summary is built from bounded, server-owned tokens only.
  for (const forbidden of [
    'normalizedValue',
    'normalized',
    'displayValue',
    'maskContact',
    'codeHash',
    'code',
    'rawSecret',
    'token',
  ]) {
    if (new RegExp(`\\b${forbidden}\\b`).test(recorder)) {
      fail(`${CANONICAL_FILES.recorder}: names "${forbidden}"; an audit summary carries neither`);
    }
  }
  if (!/requireRequestId\(\)/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: does not correlate through the platform request id`);
  }
  // A pre-customer failure has no customer, and none may be invented.
  if (!/'SYSTEM'/.test(recorder)) {
    fail(
      `${CANONICAL_FILES.recorder}: has no anonymous-compatible actor for a pre-customer outcome`,
    );
  }

  for (const file of sources(rootDir)) {
    for (const match of file.code.matchAll(/(?:this\.logger\.\w+|console\.\w+)\(([\s\S]*?)\);/g)) {
      if (/\bcode\b|secret|digest|plaintext|normalized/i.test(match[1] ?? '')) {
        fail(`${file.path}: a log call mentions the code or the target`);
      }
    }
  }
}

/** 24 — the status read is a read. */
function checkStatusIsReadOnly(rootDir, fail) {
  const query = stripComments(read(rootDir, 'statusQuery') ?? '');
  if (query === '') {
    fail(`${CANONICAL_FILES.statusQuery} does not exist`);
    return;
  }
  for (const [pattern, why] of [
    [/runInTransaction\(|TransactionManager/, 'opens a transaction'],
    [
      /recordAttempt\(|completeChallenge\(|failChallenge\(|expireStale\(|cancelChallenge\(/,
      'performs a transition',
    ],
    [/openChallenge\(|insert\(|update\(|delete\(/, 'writes'],
    [/findCodeDigest\(|verifySecretDigest\(/, 'reads or compares the digest'],
    [/purpose|normalizedValue|customer/i, 'projects a fact the status must not disclose'],
  ]) {
    if (pattern.test(query)) {
      fail(`${CANONICAL_FILES.statusQuery}: ${why}; a status read writes and discloses nothing`);
    }
  }
  if (!/findById\(/.test(query)) {
    fail(`${CANONICAL_FILES.statusQuery}: does not read the challenge`);
  }
  // Effective expiry is computed, never persisted by the read.
  if (!/'EXPIRED'/.test(query) || !/expiresAt/.test(query)) {
    fail(`${CANONICAL_FILES.statusQuery}: does not report a time-expired ISSUED row as expired`);
  }
}

/** 21 — no schema, no migration, and the app boundary holds. */
function checkNoSchemaChange(rootDir, fail) {
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B04 adds none`);
  }

  for (const file of sources(rootDir)) {
    if (/pgTable\(|uniqueIndex\(|alterTable|ALTER TABLE/i.test(file.code)) {
      fail(`${file.path}: declares schema; B04 changes none`);
    }
    for (const specifier of importSpecifiers(file.raw)) {
      if (specifier.includes('apps/worker') || specifier.includes('/worker/src/')) {
        fail(`${file.path} imports ${specifier}; apps never import each other`);
      }
    }
  }
}

export function checkApp4B04Contract(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkPublishedSurface(rootDir, fail);
  checkAttemptBody(rootDir, fail);
  checkPublishedResponses(rootDir, fail);
  checkVerifierReuse(rootDir, fail);
  checkAttemptBudget(rootDir, fail);
  checkAttemptStateMachine(rootDir, fail);
  checkPurposeEffects(rootDir, fail);
  checkNoIssuanceOrDelivery(rootDir, fail);
  checkAuditEvidence(rootDir, fail);
  checkStatusIsReadOnly(rootDir, fail);
  checkNoSchemaChange(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4B04Contract(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-b04-contract — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app4-b04-contract — two new operations at the canonical attempt and status paths ' +
      "beside B03's preserved pair, with no grant route and no APP5/6/7 business operation; a " +
      'strict six-decimal-character code string as the whole attempt body; responses of ' +
      "challenge id, LC-02 state and expiry only; P01's peppered constant-time verifier with " +
      'no second digest, KDF or equality on a stored hash; the budget read from the published ' +
      'policy and derived from the append-only ledger with no fallback, counter or lockout ' +
      'field; only MATCH, MISMATCH and EXPIRED_AT_ENTRY appended, terminal replay refused, ' +
      'expiry enforced before comparison, single use guarded by the transition under the target ' +
      'lock; SUBMISSION resolving identity through APP4-B02 from challenge-owned facts ' +
      're-derived through P01, STEP_UP creating no grant or action, no code minted and no ' +
      'notification requested; an audit trail naming no code, digest or contact; a status read ' +
      'that opens no transaction and performs no transition; and no schema or migration',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
