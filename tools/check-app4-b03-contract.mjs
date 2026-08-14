#!/usr/bin/env node
/**
 * `APP4-B03` — the verification issue/resend contract.
 *
 * The failures this gate exists for are the ones that look like progress.
 * Returning the code "so the frontend can autofill it in development". Rotating
 * the live challenge on every issue call, which is a resend with the cooldown
 * removed. Sealing an envelope directly because importing B01 felt indirect.
 * Adding a `customerId` field, or a `CUSTOMER_NOT_FOUND` refusal, either of
 * which turns the endpoint into a registration oracle. Hard-coding 600 and 60
 * because the numbers are right there in the ADR. Each one works, and each one
 * breaks something locked.
 *
 * Assertions read the **generated OpenAPI document** and **real source with
 * comments stripped** — never prose, and never the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b03-contract.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MODULE_DIR = 'apps/api/src/modules/customer';
/**
 * Exactly the surface `APP4-B03` owns.
 *
 * Three trees plus three named application files, rather than the whole
 * `application/` directory: `APP4-B02`'s identity service lives there too, and a
 * rule saying "this must not reach `CustomerRepository`" would otherwise fail on
 * the checkpoint whose entire job is to reach it.
 */
export const B03_DIRS = Object.freeze([
  `${MODULE_DIR}/domain/verification`,
  `${MODULE_DIR}/presentation`,
  `${MODULE_DIR}/infrastructure/policy`,
  `${MODULE_DIR}/infrastructure/crypto`,
]);

const B03_APPLICATION_FILES = Object.freeze([
  'verification-challenge.issuer.ts',
  'issue-verification-challenge.use-case.ts',
  'resend-verification-challenge.use-case.ts',
]);

/**
 * `APP4-B04`'s own files, which this gate does not read as B03 source.
 *
 * Reconciliation, not relaxation. Two of B03's trees — `presentation/` and
 * `domain/verification/` — are shared with B04 by design: the four operations
 * answer the same challenges on the same controller, and splitting the
 * controller would rename B03's published `operationId`s. So the rules that say
 * "this must not compare a code" or "this must not reach customer identity"
 * would otherwise fail on the checkpoint whose entire job is to do both — the
 * same situation `B03_APPLICATION_FILES` already handles for B02's identity
 * service.
 *
 * It is an explicit **file list**, never a pattern: a glob would let any future
 * file opt out of B03's invariants by choosing a name. Each entry is asserted to
 * exist, so the list cannot quietly become a hole once a file is renamed away.
 */
export const B04_FILES = Object.freeze([
  `${MODULE_DIR}/presentation/schemas/verification-attempt.request.ts`,
  `${MODULE_DIR}/presentation/schemas/verification-challenge-status.response.ts`,
  `${MODULE_DIR}/domain/verification/verification-attempt-outcome.ts`,
  `${MODULE_DIR}/domain/verification/verification-attempt-http.errors.ts`,
  `${MODULE_DIR}/domain/verification/challenge-verified-evidence.ts`,
  // The controller carries both checkpoints' handlers, so it is neither purely
  // B03's nor purely B04's. Its B03 obligations are asserted directly in
  // `checkSharedController` rather than through the owned-source sweep.
  `${MODULE_DIR}/presentation/public-verification.controller.ts`,
]);

/**
 * `APP4-B06`'s own files, which this gate does not read as B03 source.
 *
 * Same footing as {@link B04_FILES} above, and added for the same reason: B03
 * sweeps whole directories, and B06 delivered the public secure-link resolver
 * into three of them. Its files legitimately carry `SECURE_ACCESS_GRANT` and a
 * presentation `code:` field — a grant read is the whole point of the endpoint,
 * and `SECURE_LINK_UNAVAILABLE` is its published non-enumerating code.
 *
 * Excluding them changes nothing about what B03 must still prove: every rule
 * below still runs against every B03 file, so a code leaking into *B03's* own
 * presentation shapes, or a B03 file reaching for a grant, still fails. The
 * mutation suite pins that.
 */
export const B06_FILES = Object.freeze([
  `${MODULE_DIR}/presentation/public-secure-link.controller.ts`,
  `${MODULE_DIR}/presentation/schemas/secure-link-resolve.request.ts`,
  `${MODULE_DIR}/presentation/schemas/secure-link-resolution.response.ts`,
  `${MODULE_DIR}/infrastructure/policy/secure-link-policy.reader.ts`,
  `${MODULE_DIR}/infrastructure/crypto/secure-link-token.minter.ts`,
]);

/** The one public route `APP4-B06` publishes. Authorized; every other stays refused. */
export const SECURE_LINK_RESOLVE_PATH = '/api/public/secure-links/resolve';

/**
 * The two `APP4-B07` Admin routes whose names contain "grant".
 *
 * Declared here, once, and imported by the `APP4-B04`, `-B05` and `-B06` gates,
 * which all carry a variant of the same "no grant route" rule. One list rather
 * than four copies: the rule those gates encode is *"grants have no **public**
 * surface"*, and it was written when the only way to see that was "no path
 * matches /grant/". `APP4-B07` published two authenticated Admin routes that
 * match the pattern and are not public, so the pattern needs an allowlist — and
 * an allowlist that existed in four places would be four chances for a fifth
 * route to be quietly added to one of them.
 *
 * What stays refused is everything else: an Admin *issue* or *reissue* route, a
 * global `/api/admin/secure-grants` listing, a step-up endpoint, and any public
 * grant path whatsoever. `APP4-B07`'s own gate asserts these two exist, carry
 * the expected verbs and are Admin-protected; these gates only stop treating
 * them as violations.
 */
export const B07_ADMIN_GRANT_PATHS = Object.freeze([
  '/api/admin/customers/{customerId}/grants',
  '/api/admin/secure-grants/{grantId}/revoke',
]);

export const CANONICAL_FILES = Object.freeze({
  controller: `${MODULE_DIR}/presentation/public-verification.controller.ts`,
  request: `${MODULE_DIR}/presentation/schemas/public-verification.request.ts`,
  response: `${MODULE_DIR}/presentation/schemas/verification-challenge.response.ts`,
  issuer: `${MODULE_DIR}/application/verification-challenge.issuer.ts`,
  issueUseCase: `${MODULE_DIR}/application/issue-verification-challenge.use-case.ts`,
  resendUseCase: `${MODULE_DIR}/application/resend-verification-challenge.use-case.ts`,
  policy: `${MODULE_DIR}/domain/verification/verification-challenge-policy.ts`,
  policyReader: `${MODULE_DIR}/infrastructure/policy/verification-policy.reader.ts`,
  errors: `${MODULE_DIR}/domain/verification/verification-http.errors.ts`,
  repositoryAdapter: `${MODULE_DIR}/infrastructure/persistence/drizzle-verification-challenge.repository.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const ISSUE_PATH = '/api/public/verification/challenges';
export const RESEND_PATH = '/api/public/verification/challenges/{challengeId}/resend';
/**
 * `APP4-B04`'s two authorized paths.
 *
 * Named here rather than merely tolerated. At B03's closure this gate asserted
 * that no attempt or status route existed anywhere, which was correct then and
 * became stale the moment B04 published them. The replacement is not "allow
 * anything that looks like B04" — it is an exact four-path world, so an
 * unauthorized fifth verification route still fails, and a B05 grant endpoint
 * fails whatever it is called.
 */
export const ATTEMPT_PATH = '/api/public/verification/challenges/{challengeId}/attempts';
export const STATUS_PATH = '/api/public/verification/challenges/{challengeId}';
export const POLICY_KEY = 'verification.challenge';
const MIGRATION_COUNT = 34;

/** Locked `APP4-G01` numbers. Present in the policy store, never in source. */
const POLICY_LITERALS = [600, 60, 900];

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

function sourceFiles(rootDir, relative) {
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
      else if (entry.name.endsWith('.ts')) found.push(full);
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

function b03Sources(rootDir) {
  const owned = B03_DIRS.flatMap((dir) => productionSources(rootDir, dir)).filter(
    (file) => !B04_FILES.includes(file.path) && !B06_FILES.includes(file.path),
  );
  const application = productionSources(rootDir, `${MODULE_DIR}/application`).filter((file) =>
    B03_APPLICATION_FILES.some((name) => file.path.endsWith(name)),
  );
  return [...owned, ...application];
}

/**
 * The exclusion list names only files that exist.
 *
 * Without this a renamed or deleted B04 file would leave a stale entry that
 * silently exempts nothing today and could be pointed at a B03 file tomorrow.
 */
function checkExclusionIsReal(rootDir, fail) {
  for (const relative of B06_FILES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} is exempted as APP4-B06 source but does not exist`);
    }
  }
  for (const relative of B04_FILES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} is exempted as APP4-B04 source but does not exist`);
    }
  }
}

function loadOpenApi(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return undefined;
  }
  return JSON.parse(raw);
}

/** 1, 2, 3, 5, 6, 7 — the published surface is exactly two operations. */
function checkPublishedContract(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  // 3 — the verification surface is exactly the four authorized operations.
  //
  // At B03's closure this rule read "no attempt or status route exists". That
  // was true then and is stale now that `APP4-B04` published both, so it is
  // stated as the current world instead: B03's two POSTs, B04's one POST and one
  // GET, and nothing else. A B05 grant route, a `/verify` alias or a third
  // method on any of the four still fails, and B03's own pair is still asserted
  // by name and by verb.
  const verificationPaths = Object.keys(document.paths ?? {}).filter((path) =>
    /verification/i.test(path),
  );
  const expected = [ISSUE_PATH, RESEND_PATH, ATTEMPT_PATH, STATUS_PATH].sort();
  if (JSON.stringify(verificationPaths.slice().sort()) !== JSON.stringify(expected)) {
    fail(
      `verification paths are [${verificationPaths.join(', ')}]; expected exactly ` +
        `[${expected.join(', ')}]`,
    );
    return;
  }

  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  const methodsOf = (path) =>
    methods.filter((method) => document.paths[path][method] !== undefined);
  for (const [path, verbs] of [
    [ISSUE_PATH, ['post']],
    [RESEND_PATH, ['post']],
    [ATTEMPT_PATH, ['post']],
    [STATUS_PATH, ['get']],
  ]) {
    const actual = methodsOf(path);
    if (JSON.stringify(actual) !== JSON.stringify(verbs)) {
      fail(`${path} publishes [${actual.join(', ')}]; expected [${verbs.join(', ')}]`);
    }
  }

  // 3b — nothing beyond verification has grown a grant or step-up endpoint.
  //
  // At B03's closure this read "no grant or secure-link route exists", which was
  // true then and is stale now that `APP4-B06` published exactly one. Stated as
  // the current world instead: `APP4-B05` still has no public surface, and the
  // only secure-link route in the document is B06's single POST resolver. A
  // grant issue/revoke route, a step-up endpoint, a second secure-link path or a
  // GET form of this one all still fail.
  for (const path of Object.keys(document.paths ?? {})) {
    if (path === SECURE_LINK_RESOLVE_PATH) {
      const verbs = ['get', 'post', 'put', 'patch', 'delete'].filter(
        (method) => document.paths[path][method] !== undefined,
      );
      if (JSON.stringify(verbs) !== JSON.stringify(['post'])) {
        fail(`${path} publishes [${verbs.join(', ')}]; APP4-B06 owns one POST`);
      }
      continue;
    }
    // `APP4-B07` published two authenticated Admin grant routes. They are
    // authorized by name, and their guards are B07's gate to assert — the rule
    // here is still "grants have no *public* surface", which they do not give
    // them.
    if (B07_ADMIN_GRANT_PATHS.includes(path)) {
      continue;
    }
    if (/grant|secure-link|step-up|stepup/i.test(path)) {
      fail(`${path} looks like an APP4-B05 route; grants have no public surface`);
    }
  }

  // 4, 5, 7 — what the response may and must carry.
  const response = document.components?.schemas?.VerificationChallengeResponse;
  if (response === undefined) {
    fail('VerificationChallengeResponse is referenced but not published as a component');
    return;
  }
  const fields = Object.keys(response.properties ?? {});
  const requiredFields = ['challengeId', 'expiresAt', 'resendAvailableAt'];
  for (const field of requiredFields) {
    if (!fields.includes(field)) {
      fail(`VerificationChallengeResponse has no "${field}"`);
    }
  }
  // `APP4-B07`'s Admin support surface names a customer, and must: its routes
  // are *keyed* by the Customer an operator asked for, behind
  // `AuthenticatedAdminGuard`. Two things are lifted out of the scan by exact
  // name — the two Admin path items, whose keys and `customerId` path parameter
  // match the pattern, and the one response component that publishes the field.
  //
  // Lifted by name rather than the field being dropped from the ban, so the
  // invariant this rule exists for — *no anonymous verification response names a
  // customer* — still holds over every other path and schema in the document,
  // and `contactPointId`, `codeHash` and `otp` stay refused everywhere including
  // inside the exempted ones.
  const scanned = JSON.parse(JSON.stringify(document));
  for (const path of ['/api/admin/customers/{customerId}', ...B07_ADMIN_GRANT_PATHS]) {
    delete scanned.paths?.[path];
  }
  delete scanned.components?.schemas?.AdminCustomerDetailResponse;
  const serialized = JSON.stringify(scanned);
  for (const forbidden of ['codeHash', 'code_hash', 'otp', 'customerId', 'contactPointId']) {
    if (new RegExp(`"[^"]*${forbidden}[^"]*"\\s*:`, 'i').test(serialized)) {
      fail(`the published contract carries a "${forbidden}" field`);
    }
  }
  for (const field of fields) {
    if (/^code$|secret|hash|token/i.test(field)) {
      fail(`VerificationChallengeResponse exposes "${field}"`);
    }
  }

  // 6 — the purpose set stays the locked pair.
  const body = document.components?.schemas?.IssueVerificationChallengeBody;
  const purposes = body?.properties?.purpose?.enum;
  if (JSON.stringify(purposes) !== JSON.stringify(['SUBMISSION', 'STEP_UP'])) {
    fail(`the published purpose set is ${JSON.stringify(purposes)}`);
  }
  const bodyFields = Object.keys(body?.properties ?? {}).sort();
  if (JSON.stringify(bodyFields) !== JSON.stringify(['contact', 'contactKind', 'purpose'])) {
    fail(`the issue body publishes [${bodyFields.join(', ')}]`);
  }
}

/** 8 — no refusal names a customer, and no code reaches a response. */
function checkNonEnumeration(rootDir, fail) {
  const errors = stripComments(read(rootDir, 'errors') ?? '');
  if (errors === '') {
    fail(`${CANONICAL_FILES.errors} does not exist`);
    return;
  }
  for (const forbidden of [
    'CUSTOMER_NOT_FOUND',
    'ACCOUNT_EXISTS',
    'ALREADY_REGISTERED',
    'EMAIL_ALREADY',
    'PHONE_ALREADY',
    'CONTACT_OWNED_BY_CUSTOMER',
    'NOT_A_CUSTOMER',
  ]) {
    if (errors.includes(forbidden)) {
      fail(`${CANONICAL_FILES.errors}: "${forbidden}" would disclose customer existence`);
    }
  }

  // 14 — issuance cannot branch on identity, because it cannot reach it.
  for (const file of b03Sources(rootDir)) {
    if (
      /CUSTOMER_REPOSITORY|CustomerRepository|ResolveOrCreateVerifiedCustomer/.test(file.code) ||
      // The methods only the customer repository has. A field named `customers`
      // proves nothing; calling one of these does.
      /findByVerifiedContact\(|createWithVerifiedContact\(|listContactPoints\(|addContactPoint\(/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: reaches customer identity; issuance must not depend on it`);
    }
  }
}

/** 9, 10, 11, 12 — the primitives are reused, never re-implemented. */
function checkPrimitiveReuse(rootDir, fail) {
  const issuerRaw = read(rootDir, 'issuer') ?? '';
  const issuer = stripComments(issuerRaw);
  if (issuerRaw === '') {
    fail(`${CANONICAL_FILES.issuer} does not exist`);
    return;
  }

  if (!/this\.minter\.mint\(\)/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not mint through the P01 issuer seam`);
  }
  if (!/digestSecret\(/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not digest through the P01 HMAC authority`);
  }
  if (!/this\.notifications\.request\(/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not hand off through the B01 NotificationRequest`);
  }
  if (!/codeHash/.test(issuer) || /codeHash:\s*code\b/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: the challenge does not persist a digest`);
  }

  const minter = stripComments(
    read(rootDir, `${MODULE_DIR}/infrastructure/crypto/verification-code.minter.ts`) ?? '',
  );
  if (!/issueVerificationCode\(\)/.test(minter)) {
    fail('the code minter does not delegate to the P01 issuer');
  }

  // 11 — B03 seals and decrypts nothing. One application seam does, and it is B01.
  for (const file of b03Sources(rootDir)) {
    for (const needle of ['sealDeliveryEnvelope', 'openDeliveryEnvelope', 'createCipheriv']) {
      if (file.code.includes(needle)) {
        fail(`${file.path}: calls ${needle}; envelope handling belongs to B01 and W01`);
      }
    }
    // 12, 13 — no plaintext leaves through a log, a response or an error.
    for (const match of file.code.matchAll(/(?:this\.logger\.\w+|console\.\w+)\(([\s\S]*?)\);/g)) {
      if (/\bcode\b|secret|plaintext|normalized/i.test(match[1] ?? '')) {
        fail(`${file.path}: a log call mentions the code or the target`);
      }
    }
    if (/\bcode\b\s*:/.test(file.code) && file.path.includes('presentation')) {
      fail(`${file.path}: a presentation shape carries a "code" field`);
    }
  }
}

/** 15, 16, 23 — B04, grants and W01 behaviour stay out. */
function checkScopeBoundaries(rootDir, fail) {
  for (const file of b03Sources(rootDir)) {
    for (const [pattern, why] of [
      [
        /recordAttempt\(|contactVerificationAttempts|verification_attempts/,
        'writes an attempt row',
      ],
      [/completeChallenge\(|failChallenge\(/, 'completes or fails a challenge; that is B04'],
      [/MATCH|MISMATCH|EXPIRED_AT_ENTRY/, 'classifies a submitted answer; that is B04'],
      [/verifySecretDigest\(|fixedWidthEquals\(/, 'compares a submitted code; that is B04'],
      [/SECURE_ACCESS_GRANT|issueSecureLinkToken|secure_access_grants/, 'touches a grant'],
      [
        /DEAD_LETTER|retryDelay|maxAttempts\s*[:=]\s*\d|background_job_attempts/,
        'reimplements W01 retry',
      ],
      // `maxAttempts` is parsed by the policy contract and consumed by B04. What
      // B03 must not do is *read* it — a submitted-answer budget it does not own.
      [/policy\.maxAttempts|\.maxAttempts\s*[<>=]/, 'consumes the B04 attempt budget'],
    ]) {
      if (pattern.test(file.code)) {
        fail(`${file.path}: ${why}`);
      }
    }
  }
}

/** 18, 19, 20, 21, 22 — the arbiter, the policy and the two issue paths. */
function checkBehaviour(rootDir, fail) {
  const policy = stripComments(read(rootDir, 'policy') ?? '');
  if (!policy.includes(`'${POLICY_KEY}'`)) {
    fail(`${CANONICAL_FILES.policy}: does not name the ${POLICY_KEY} key`);
  }
  const reader = stripComments(read(rootDir, 'policyReader') ?? '');
  if (!/currentValue\(/.test(reader)) {
    fail(`${CANONICAL_FILES.policyReader}: does not read the published policy value`);
  }
  for (const needle of ['publishVersion', 'ensureKey', 'staff-bootstrap', 'PublishApp4Policy']) {
    for (const file of b03Sources(rootDir)) {
      if (file.code.includes(needle)) {
        fail(`${file.path}: B03 consumes policy and never publishes it ("${needle}")`);
      }
    }
  }

  // 20 — no fallback constant anywhere in the owned surface.
  //
  // The policy contract itself is exempt from the bare-literal sweep and only
  // from that: its sanity bounds are written as arithmetic (`24 * 60 * 60`), and
  // a digit-matching rule cannot tell that from a default. The field-assignment
  // rule below still applies to it, which is the one that would catch a real
  // default.
  for (const file of b03Sources(rootDir)) {
    for (const literal of file.path === CANONICAL_FILES.policy ? [] : POLICY_LITERALS) {
      if (new RegExp(`\\b${String(literal)}\\b(?!\\s*\\*)`).test(file.code)) {
        fail(`${file.path}: restates the policy value ${String(literal)}`);
      }
    }
    if (/ttlSeconds\s*[:=]\s*\d|resendCooldownSeconds\s*[:=]\s*\d/.test(file.code)) {
      fail(`${file.path}: hard-codes a policy duration`);
    }
  }

  // 18 — the CST-007 conflict is translated exactly, never by SQLSTATE.
  const issuer = stripComments(read(rootDir, 'issuer') ?? '');
  if (!issuer.includes("'CHALLENGE_ALREADY_OPEN'")) {
    fail(`${CANONICAL_FILES.issuer}: does not match the catalogued CST-007 code`);
  }
  if (/'23505'|"23505"/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: matches the raw SQLSTATE; CST-007 is not the only 23505`);
  }
  if (!/CONCURRENT_ISSUE_LOSS/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: no bounded concurrent-issue outcome`);
  }

  // 21 — a live challenge is returned, never rotated.
  const issue = stripComments(read(rootDir, 'issueUseCase') ?? '');
  if (!/resolveOpen\(/.test(issue) || !/ALREADY_OPEN/.test(issue)) {
    fail(`${CANONICAL_FILES.issueUseCase}: does not return an already-open challenge`);
  }
  if (!/expireStale\(/.test(issue)) {
    fail(`${CANONICAL_FILES.issueUseCase}: does not expire stale rows before inserting`);
  }
  if (!/countIssuedSince\(/.test(issue)) {
    fail(`${CANONICAL_FILES.issueUseCase}: does not enforce the issuance rate window`);
  }
  if (!/lockTarget\(/.test(issue)) {
    fail(`${CANONICAL_FILES.issueUseCase}: does not serialize issuance for the target`);
  }
  if (!/runInTransaction\(/.test(issue)) {
    fail(`${CANONICAL_FILES.issueUseCase}: the atomic issue path has no transaction`);
  }

  // 22 — a resend creates a new identity and cancels the source.
  const resend = stripComments(read(rootDir, 'resendUseCase') ?? '');
  if (!/cancelChallenge\(/.test(resend)) {
    fail(`${CANONICAL_FILES.resendUseCase}: does not cancel the source challenge`);
  }
  if (!/this\.issuer\.issue\(/.test(resend)) {
    fail(`${CANONICAL_FILES.resendUseCase}: does not issue a replacement challenge`);
  }
  if (/EXPIRED/.test(resend)) {
    fail(`${CANONICAL_FILES.resendUseCase}: marks a live source EXPIRED; DB3 locks CANCELLED`);
  }
  const request = stripComments(read(rootDir, 'request') ?? '');
  if (/resend[A-Za-z]*Schema|resend[A-Za-z]*Body/i.test(request)) {
    fail(`${CANONICAL_FILES.request}: the resend accepts a body; its target comes from the source`);
  }
}

/**
 * B03's obligations on the controller it now shares with `APP4-B04`.
 *
 * The owned-source sweep cannot read this file any more — it legitimately names
 * `MISMATCH` and imports B04's refusals — so the B03 facts it must still carry
 * are asserted here by name rather than dropped. This is the reconciliation's
 * whole cost, and leaving it out is what would turn "the gate no longer fails"
 * into "the gate no longer checks".
 */
function checkSharedController(rootDir, fail) {
  const controller = stripComments(read(rootDir, 'controller') ?? '');
  if (controller === '') {
    fail(`${CANONICAL_FILES.controller} does not exist`);
    return;
  }

  // Both B03 handlers are still here, still POSTs, still on the canonical paths.
  if (!/@Post\(\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the issue handler is gone`);
  }
  if (!/@Post\('\:challengeId\/resend'\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the resend handler is gone`);
  }
  if (!/@Controller\('public\/verification\/challenges'\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the canonical route prefix changed`);
  }
  // One controller, one class name — Nest derives every `operationId` from it,
  // so a split or a rename silently renames B03's published operations.
  if (!/export class PublicVerificationController\b/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the controller class was renamed or split`);
  }
  // B03's refusals still travel through the one mapping table, and through
  // B03's own guard: matching the call anywhere in the file would be satisfied
  // by B04's guard alone once both live here.
  if (!/private async guard\([\s\S]*?verificationFailureResponse\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: issue and resend no longer map their bounded failures`);
  }
  // And nothing in it seals, decrypts, mints or reaches customer identity.
  for (const needle of [
    'sealDeliveryEnvelope',
    'openDeliveryEnvelope',
    'createCipheriv',
    'CUSTOMER_REPOSITORY',
    'CustomerRepository',
    'issueVerificationCode',
    'digestSecret',
  ]) {
    if (controller.includes(needle)) {
      fail(`${CANONICAL_FILES.controller}: references ${needle}; that belongs elsewhere`);
    }
  }
  if (/\bcode\b\s*:/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a response shape carries a "code" field`);
  }
}

/** 17 — no schema, no migration, and the app boundary holds. */
function checkNoSchemaChange(rootDir, fail) {
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B03 adds none`);
  }

  for (const file of productionSources(rootDir, MODULE_DIR)) {
    if (/pgTable\(|uniqueIndex\(|alterTable/i.test(file.code)) {
      fail(`${file.path}: declares schema; B03 changes none`);
    }
    for (const specifier of importSpecifiers(file.raw)) {
      if (specifier.includes('apps/worker') || specifier.includes('/worker/src/')) {
        fail(`${file.path} imports ${specifier}; apps never import each other`);
      }
    }
  }
}

export function checkApp4B03Contract(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkExclusionIsReal(rootDir, fail);
  checkPublishedContract(rootDir, fail);
  checkSharedController(rootDir, fail);
  checkNonEnumeration(rootDir, fail);
  checkPrimitiveReuse(rootDir, fail);
  checkScopeBoundaries(rootDir, fail);
  checkBehaviour(rootDir, fail);
  checkNoSchemaChange(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4B03Contract(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-b03-contract — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app4-b03-contract — B03 still publishes exactly its two POST operations at the ' +
      'canonical issue and resend paths inside a four-operation verification surface whose ' +
      'other two are the authorized APP4-B04 attempt and status routes, with no grant or ' +
      'step-up endpoint anywhere and no third method on any path; the shared controller keeps ' +
      'its class name, prefix, both handlers and its failure mapping and reaches no identity, ' +
      'mint or envelope; the response ' +
      'carries a challenge id, an expiry and a resend instant and no code, hash, customer or ' +
      'contact field; the purpose set is the locked pair; issuance reaches no customer ' +
      'repository and no refusal names one; the code is minted and digested through P01 and ' +
      'handed to B01, which is the only seam that seals; the challenge stores a digest; the ' +
      'CST-007 arbiter is translated by its catalogued code with no SQLSTATE match; a live ' +
      'challenge is returned rather than rotated and a resend cancels its source and issues a ' +
      'new one; every duration comes from the published policy with no fallback constant; and ' +
      'no attempt row, grant, retry behaviour, schema or migration is part of it',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
