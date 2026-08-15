#!/usr/bin/env node
/**
 * `APP4-B05` — the secure-grant lifecycle contract.
 *
 * The failures this gate exists for are the ones that look like progress:
 * adding a `scope` parameter because the column exists; defaulting the TTL to
 * seven days so issuance works before the policy is published; letting a
 * duplicate `issue` rotate the token because the caller "obviously" wants a
 * working link; copying the old envelope on reissue because the recipient has
 * not changed; putting the grant's `token_hash` in the audit summary because a
 * hash is "not the secret"; adding a controller so APP5 can call it over HTTP;
 * carrying the token in `?t=` because a fragment is awkward to test. Each one
 * works, and each one breaks something locked.
 *
 * Assertions read **real source with comments stripped**, never prose and never
 * the completion report — every file in this checkpoint documents what it
 * deliberately does not do, and a gate that failed on its own explanation would
 * be deleted within a checkpoint.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b05.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';
import { B07_ADMIN_GRANT_PATHS, MODULE_DIR } from './check-app4-b03-contract.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const WORKER_DIR = 'apps/worker/src/jobs/notification-delivery';

export const CANONICAL_FILES = Object.freeze({
  issuer: `${MODULE_DIR}/application/secure-grant.issuer.ts`,
  notifier: `${MODULE_DIR}/application/secure-grant.notifier.ts`,
  recorder: `${MODULE_DIR}/application/secure-grant-audit.recorder.ts`,
  stepUp: `${MODULE_DIR}/application/step-up-window.service.ts`,
  policy: `${MODULE_DIR}/domain/grant/secure-grant-policy.ts`,
  outcome: `${MODULE_DIR}/domain/grant/secure-grant-outcome.ts`,
  policyReader: `${MODULE_DIR}/infrastructure/policy/secure-grant-policy.reader.ts`,
  minter: `${MODULE_DIR}/infrastructure/crypto/secure-link-token.minter.ts`,
  module: `${MODULE_DIR}/customer.module.ts`,
  renderer: `${WORKER_DIR}/domain/secure-link.renderer.ts`,
  originConfig: `${WORKER_DIR}/config/storefront-origin.config.ts`,
  deliveryUseCase: `${WORKER_DIR}/application/notification-delivery.usecase.ts`,
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  seed: 'packages/database/seed/app4-policy-configuration.seed.json',
});

/** Every file `APP4-B05` owns. The whole surface the rules read. */
export const B05_SOURCES = Object.freeze([
  CANONICAL_FILES.issuer,
  CANONICAL_FILES.notifier,
  CANONICAL_FILES.recorder,
  CANONICAL_FILES.stepUp,
  CANONICAL_FILES.policy,
  CANONICAL_FILES.outcome,
  CANONICAL_FILES.policyReader,
  CANONICAL_FILES.minter,
]);

/** The API-side sources plus the worker's rendering seam. */
const ALL_SOURCES = Object.freeze([
  ...B05_SOURCES,
  CANONICAL_FILES.renderer,
  CANONICAL_FILES.originConfig,
]);

/** The published `secure_grant` values. They live in the seed, never in source. */
const TTL_SECONDS = 604800;
const STEP_UP_WINDOW_SECONDS = 900;

/**
 * The published operation count.
 *
 * 46 while B05 was the newest checkpoint — the entry world, unchanged, because
 * B05 publishes zero operations. Then 47: `APP4-B06` added exactly one. Then 50:
 * `APP4-B07` added three. Now 52: `APP4-B08` added two. The count stays asserted
 * rather than dropped, because what it really guards is that **B05's own surface
 * is still zero** — an issue or reissue route appearing would move this number
 * too.
 *
 * B07's revoke route is the one place that needs saying out loud: it is not
 * B05 growing a surface. B05 still publishes nothing, and B07's controller calls
 * `SecureGrantIssuer.revoke` rather than reimplementing the transition, which is
 * what `checkInternalCapability` below still asserts.
 */
const EXPECTED_OPERATIONS = 52;

/**
 * The one public path `APP4-B06` owns.
 *
 * B05's rule was "no `grant`-or-`secure-link` path exists at all", which was
 * true at its closure and is stale now. Restated as the current world: this
 * exact path with this exact verb is B06's, and any *other* grant or
 * secure-link route still fails — which is the invariant B05 actually needs.
 */
const B06_RESOLVE_PATH = '/api/public/secure-links/resolve';
const MIGRATION_COUNT = 34;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Owned sources as `{ path, raw, code }` with prose removed. */
function sources(rootDir, list = ALL_SOURCES) {
  return list
    .map((relative) => ({ path: relative, raw: read(rootDir, relative) ?? '' }))
    .filter((file) => file.raw !== '')
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

function codeOf(rootDir, key) {
  const raw = read(rootDir, key);
  return raw === undefined ? '' : stripComments(raw);
}

function checkFilesExist(rootDir, fail) {
  for (const relative of ALL_SOURCES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} does not exist`);
    }
  }
}

/** 1 — zero endpoints, zero controllers, no published operation. */
function checkNoHttpSurface(rootDir, fail) {
  for (const file of sources(rootDir)) {
    if (/@Controller\(|@Get\(|@Post\(|@Put\(|@Patch\(|@Delete\(/.test(file.code)) {
      fail(`${file.path}: declares an HTTP route; APP4-B05 has zero endpoints`);
    }
    if (/@ApiOperation\(|createZodDto|extends\s+\w*Dto\b/.test(file.code)) {
      fail(`${file.path}: declares an OpenAPI DTO; APP4-B05 publishes nothing`);
    }
  }

  // The module registers no controller that would give *B05* a surface.
  // `PublicSecureLinkController` is `APP4-B06`'s and is named explicitly, so a
  // grant issue/reissue/revoke controller appearing here still fails — which is
  // the invariant, rather than "the word never appears".
  const moduleCode = codeOf(rootDir, 'module');
  const controllers = (/controllers:\s*\[([^\]]*)\]/.exec(moduleCode)?.[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '' && name !== 'PublicSecureLinkController');
  if (controllers.some((name) => /Grant|SecureLink|SecureAccess/i.test(name))) {
    fail(`${CANONICAL_FILES.module}: registers a grant controller; B05 adds none`);
  }

  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return;
  }
  const document = JSON.parse(raw);
  const paths = Object.keys(document.paths ?? {});
  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  // B06's resolver and B07's two Admin routes are the authorized world. Any
  // *other* grant path — an Admin issue or reissue, a global grant listing, a
  // public grant route — still fails, which is the invariant B05 needs.
  const authorized = [B06_RESOLVE_PATH, ...B07_ADMIN_GRANT_PATHS];
  const grantPaths = paths.filter(
    (path) => /grant|secure-link/i.test(path) && !authorized.includes(path),
  );
  if (grantPaths.length > 0) {
    fail(`the published surface declares [${grantPaths.join(', ')}]; B05 publishes none`);
  }
  // B07 owns one verb on each of its two, and neither may grow an issue or
  // reissue sibling on the same path.
  for (const [path, expected] of [
    [B07_ADMIN_GRANT_PATHS[0], ['get']],
    [B07_ADMIN_GRANT_PATHS[1], ['post']],
  ]) {
    if (!paths.includes(path)) {
      continue;
    }
    const verbs = methods.filter((method) => document.paths?.[path]?.[method] !== undefined);
    if (JSON.stringify(verbs) !== JSON.stringify(expected)) {
      fail(`${path} publishes [${verbs.join(', ')}]; APP4-B07 owns [${expected.join(', ')}]`);
    }
  }
  if (paths.includes(B06_RESOLVE_PATH)) {
    const verbs = methods.filter((method) => document.paths?.[B06_RESOLVE_PATH]?.[method]);
    if (JSON.stringify(verbs) !== JSON.stringify(['post'])) {
      fail(`${B06_RESOLVE_PATH} publishes [${verbs.join(', ')}]; APP4-B06 owns one POST`);
    }
  }
  const operations = paths.reduce(
    (total, path) =>
      total + methods.filter((method) => document.paths?.[path]?.[method] !== undefined).length,
    0,
  );
  if (operations !== EXPECTED_OPERATIONS) {
    fail(
      `the API publishes ${String(operations)} operations; APP4-B05 adds none ` +
        `(expected ${String(EXPECTED_OPERATIONS)})`,
    );
  }
}

/** 2, 24, 25, 32 — the internal capability, and the seams it must and must not use. */
function checkInternalCapability(rootDir, fail) {
  const issuer = codeOf(rootDir, 'issuer');
  if (!/class\s+SecureGrantIssuer\b/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: no SecureGrantIssuer class`);
  }
  for (const method of ['issue', 'reissue', 'revoke']) {
    if (!new RegExp(`async\\s+${method}\\s*\\(`).test(issuer)) {
      fail(`${CANONICAL_FILES.issuer}: no ${method} method`);
    }
  }

  const moduleCode = codeOf(rootDir, 'module');
  const exports = /exports:\s*\[([\s\S]*?)\]/.exec(moduleCode)?.[1] ?? '';
  for (const name of ['SecureGrantIssuer', 'StepUpWindow']) {
    if (!exports.includes(name)) {
      fail(`${CANONICAL_FILES.module}: does not export ${name} for its in-process callers`);
    }
  }
  // 18 — APP5 calls one port; it must not be handed the persistence repository
  // *instead*, but the existing DB7 export predates B05 and stays.
  if (exports.includes('SecureGrantNotifier')) {
    fail(`${CANONICAL_FILES.module}: exports SecureGrantNotifier; delivery is not a public seam`);
  }

  // 24 — a notified issue goes through B01's single intake. Asserted on the
  // *import*, not on a type annotation: a stale annotation survives a rename and
  // would leave this rule passing while the delivery seam had moved.
  const notifierRaw = read(rootDir, 'notifier') ?? '';
  const notifier = stripComments(notifierRaw);
  const importsB01 = importSpecifiers(notifierRaw).some((specifier) =>
    specifier.includes('notification/application/request-notification.use-case'),
  );
  if (!importsB01 || !/this\.notifications\.request\(/.test(notifier)) {
    fail(`${CANONICAL_FILES.notifier}: does not use the APP4-B01 notification intake`);
  }
  // 25, 32 — and B05 never seals or opens an envelope itself.
  for (const file of sources(rootDir, B05_SOURCES)) {
    if (/sealDeliveryEnvelope|openDeliveryEnvelope/.test(file.code)) {
      fail(`${file.path}: seals or opens a delivery envelope; APP4-B01 is the only seam`);
    }
  }
}

/** 3, 4, 5 — P01's issuer and digest, and only the digest persisted. */
function checkTokenAuthority(rootDir, fail) {
  const minter = codeOf(rootDir, 'minter');
  if (!/issueSecureLinkToken/.test(minter)) {
    fail(`${CANONICAL_FILES.minter}: does not delegate to the APP4-P01 token issuer`);
  }
  if (/randomBytes|randomUUID|randomInt|Math\.random/.test(minter)) {
    fail(`${CANONICAL_FILES.minter}: mints its own randomness; P01 owns token generation`);
  }

  const issuer = codeOf(rootDir, 'issuer');
  if (!/digestSecret\(/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not use the APP4-P01 digest`);
  }
  if (!/secureLinkTokenPepper/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not use the secure-link pepper`);
  }
  if (/verificationCodePepper/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: uses the verification-code pepper for a link token`);
  }

  for (const file of sources(rootDir, B05_SOURCES)) {
    if (/createHmac|createHash|scrypt|pbkdf2|timingSafeEqual/.test(file.code)) {
      fail(`${file.path}: computes its own digest; P01 owns the one HMAC`);
    }
  }

  // 5 — the only value written to the token column is the digest.
  if (!/tokenHash,/.test(issuer) && !/tokenHash:\s*tokenHash/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not persist a tokenHash`);
  }
  if (/tokenHash\s*[:=]\s*rawToken|tokenHash:\s*token\b/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: persists the raw token as the hash`);
  }
}

/** 6, 7 — one scope, written not accepted, and no action-scope model. */
function checkScope(rootDir, fail) {
  const issuer = codeOf(rootDir, 'issuer');
  if (!/REQUEST_ACCESS/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not fix the scope to REQUEST_ACCESS`);
  }
  if (/scopeKind:\s*(command|input)\.\w+/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: takes the scope from the caller; there is one legal value`);
  }
  if (
    /scopeKind\??:\s*(GrantScopeKind|string)/.test(
      issuer.replace(/const\s+REQUEST_ACCESS[^\n]*/, ''),
    )
  ) {
    fail(`${CANONICAL_FILES.issuer}: exposes a caller-selected scope parameter`);
  }

  // 7 — no action-scope enumeration anywhere in the checkpoint.
  const actionScopes =
    /'(accept-quotation|approve-design|initiate-payment|request-revision|request-change)'/;
  for (const file of sources(rootDir)) {
    if (actionScopes.test(file.code)) {
      fail(`${file.path}: enumerates action scopes; that is additive and out of phase`);
    }
    if (/GRANT_ACTION_SCOPES|ActionScopeKind|grant_action_scopes/.test(file.code)) {
      fail(`${file.path}: declares an action-scope model`);
    }
  }
}

/** 8, 9 — the policy is read, and no value is restated in source. */
function checkPolicy(rootDir, fail) {
  const reader = codeOf(rootDir, 'policyReader');
  if (!/SECURE_GRANT_POLICY_KEY/.test(reader) || !/PolicyConfigurationRepository/.test(reader)) {
    fail(`${CANONICAL_FILES.policyReader}: does not read the published secure_grant policy`);
  }
  if (/publishVersion|ensureKey/.test(reader)) {
    fail(`${CANONICAL_FILES.policyReader}: publishes policy; publication closed with APP4-B01-C1`);
  }

  const policy = codeOf(rootDir, 'policy');
  if (!/'secure_grant'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: does not name the secure_grant key`);
  }
  if (!/standardTtlSeconds/.test(policy) || !/stepUpWindowSeconds/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: does not parse both published fields`);
  }

  // 9 — no fallback literal. The published numbers, in any separator form, must
  // appear nowhere in source: a `??` default is the failure, and a bare constant
  // is how one gets written.
  const forbidden = [
    String(TTL_SECONDS),
    String(TTL_SECONDS).replace(/\B(?=(\d{3})+(?!\d))/g, '_'),
    String(STEP_UP_WINDOW_SECONDS),
  ];
  for (const file of sources(rootDir)) {
    for (const literal of forbidden) {
      if (new RegExp(`\\b${literal}\\b`).test(file.code)) {
        fail(
          `${file.path}: restates the published policy value ${literal}; read it, never inline it`,
        );
      }
    }
    if (/(standardTtlSeconds|stepUpWindowSeconds)\s*(\?\?|\|\|)\s*\d/.test(file.code)) {
      fail(`${file.path}: defaults a policy value; missing policy must fail closed`);
    }
  }

  // The values still live where they belong.
  const seed = read(rootDir, 'seed');
  if (seed === undefined || !seed.includes(String(TTL_SECONDS))) {
    fail(`${CANONICAL_FILES.seed}: no longer carries the published secure_grant values`);
  }
}

/** 10, 13 — CST-009 arbitrates, and a duplicate issue does not rotate. */
function checkActiveArbiter(rootDir, fail) {
  const issuer = codeOf(rootDir, 'issuer');
  if (!/GRANT_ALREADY_ACTIVE/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not handle the CST-009 conflict`);
  }
  // The `issue` body must refuse rather than rotate: no mint before the refusal.
  const issueBody = /async\s+issue\s*\([\s\S]*?\n  \}/.exec(issuer)?.[0] ?? '';
  if (issueBody === '') {
    fail(`${CANONICAL_FILES.issuer}: could not read the issue method`);
  }
  if (/revoke|supersede/.test(issueBody)) {
    fail(`${CANONICAL_FILES.issuer}: issue revokes or supersedes; rotation belongs to reissue`);
  }
  if (!/throw new SecureGrantError\(GRANT_ALREADY_ACTIVE\)/.test(issueBody)) {
    fail(`${CANONICAL_FILES.issuer}: issue does not refuse an existing ACTIVE grant`);
  }
  // No process-level mutex standing in for the database.
  for (const file of sources(rootDir, B05_SOURCES)) {
    if (/Mutex|Semaphore|globalThis\.__|process\.__lock|setInterval\(/.test(file.code)) {
      fail(`${file.path}: serialises in-process; the database is the arbiter`);
    }
  }
}

/** 11, 12, 13, 14, 15 — reissue rotates, supersedes and copies nothing. */
function checkReissue(rootDir, fail) {
  const issuer = codeOf(rootDir, 'issuer');
  const body = /async\s+reissue\s*\([\s\S]*?\n  \}/.exec(issuer)?.[0] ?? '';
  if (body === '') {
    fail(`${CANONICAL_FILES.issuer}: could not read the reissue method`);
    return;
  }

  // 11, 12 — a new grant through the same minting path, never an in-place update.
  if (!/this\.mint\(/.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: reissue mints no new grant`);
  }
  if (/expiresAt:\s*source\.|tokenHash:\s*source\./.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: reissue reuses the source's expiry or digest`);
  }

  // 13, 14 — the source becomes terminal, with a reason and its lineage.
  // The reason is asserted **at each call site**, not merely present somewhere in
  // the method: `supersede` naming the constant while `revoke` writes a
  // different string leaves the row's reason and its lineage telling two stories,
  // and the CHECK cannot tell them apart.
  const revokeCall = /(?:revokeActive|this\.grants\.revoke)\(\s*source\.id\s*,\s*([^,)]+)/.exec(
    body,
  );
  if (revokeCall === null) {
    fail(`${CANONICAL_FILES.issuer}: reissue does not revoke the source`);
  } else if (!/GRANT_SUPERSEDED_REASON/.test(revokeCall[1] ?? '')) {
    fail(`${CANONICAL_FILES.issuer}: reissue revokes without the canonical superseded reason`);
  }

  const supersedeCall = /supersede\(\s*source\.id\s*,\s*[^,]+,\s*([^,)]+)/.exec(body);
  if (supersedeCall === null) {
    fail(`${CANONICAL_FILES.issuer}: reissue does not record the lineage via supersede`);
  } else if (!/GRANT_SUPERSEDED_REASON/.test(supersedeCall[1] ?? '')) {
    fail(`${CANONICAL_FILES.issuer}: reissue supersedes without the canonical superseded reason`);
  }

  // 15 — the envelope is rebuilt from the new token; nothing carries the old one.
  if (/payload|ciphertext|envelope/i.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: reissue touches envelope material; B01 seals a fresh one`);
  }
  const notifier = codeOf(rootDir, 'notifier');
  if (!/secret:\s*input\.rawToken/.test(notifier)) {
    fail(`${CANONICAL_FILES.notifier}: does not hand B01 the freshly minted token`);
  }
}

/** 16, 17 — revoke needs a reason and is terminal. */
function checkRevoke(rootDir, fail) {
  const issuer = codeOf(rootDir, 'issuer');
  const body = /async\s+revoke\s*\([\s\S]*?\n  \}/.exec(issuer)?.[0] ?? '';
  if (body === '') {
    fail(`${CANONICAL_FILES.issuer}: could not read the revoke method`);
    return;
  }
  if (!/reason\.trim\(\)\s*===\s*''/.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: revoke accepts a blank reason`);
  }
  if (!/GRANT_REVOKE_REASON_REQUIRED/.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: revoke has no bounded blank-reason refusal`);
  }
  if (/mint\(|issueSecureLinkToken|digestSecret/.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: revoke mints or rotates a token`);
  }
  if (/notifier\.|notifications\./.test(body)) {
    fail(`${CANONICAL_FILES.issuer}: revoke requests a notification; no authority asks for one`);
  }

  // 17 — nothing anywhere reactivates a revoked grant.
  for (const file of sources(rootDir, B05_SOURCES)) {
    if (/'REVOKED'\s*(->|=>)\s*'ACTIVE'|status:\s*'ACTIVE'[^\n]*revoked/i.test(file.code)) {
      fail(`${file.path}: implies a REVOKED to ACTIVE transition; LC-03 has no such edge`);
    }
    if (/reactivate|unrevoke|restoreGrant/i.test(file.code)) {
      fail(`${file.path}: offers grant reactivation`);
    }
  }
}

/** 18, 19 — the step-up window reads B04's evidence, for STEP_UP only. */
function checkStepUpWindow(rootDir, fail) {
  const code = codeOf(rootDir, 'stepUp');
  // The purpose is asserted **inside the call**, positionally. `hasRecentCompleted`
  // takes the purpose as its third argument, so a rule that only checked the
  // constant appeared somewhere in the file would pass while the call passed a
  // caller-supplied purpose beside an unused constant.
  const call = /hasRecentCompleted\(([\s\S]*?)\)\s*;/.exec(code);
  if (call === null) {
    fail(`${CANONICAL_FILES.stepUp}: does not use hasRecentCompleted`);
  } else {
    const args = (call[1] ?? '').split(',').map((argument) => argument.trim());
    if (args[2] !== 'STEP_UP' && args[2] !== "'STEP_UP'") {
      fail(
        `${CANONICAL_FILES.stepUp}: passes "${args[2] ?? '(nothing)'}" as the purpose; ` +
          'it must be the pinned STEP_UP constant',
      );
    }
  }
  if (!/STEP_UP/.test(code)) {
    fail(`${CANONICAL_FILES.stepUp}: does not pin the STEP_UP purpose`);
  }
  // 19 — `SUBMISSION` must be unreachable, not merely unused: no branch, no
  // parameter, no default that could route one here.
  if (/SUBMISSION/.test(code)) {
    fail(`${CANONICAL_FILES.stepUp}: mentions SUBMISSION in code; identity is not presence`);
  }
  if (/purpose\s*[:=]\s*(query|input)\./.test(code)) {
    fail(`${CANONICAL_FILES.stepUp}: takes the purpose from the caller`);
  }
  if (!/stepUpNotBefore\(|stepUpWindowSeconds/.test(code)) {
    fail(`${CANONICAL_FILES.stepUp}: does not derive the window from policy`);
  }
  // It decides nothing: no issuance, no grant, no business action.
  if (/issue\(|openChallenge|grants\./.test(code)) {
    fail(`${CANONICAL_FILES.stepUp}: issues a challenge or a grant; it answers one question`);
  }
}

/** 20, 21 — the three audits exist and carry no secret. */
function checkAudit(rootDir, fail) {
  const recorder = codeOf(rootDir, 'recorder');
  for (const action of ['secure_grant.issued', 'secure_grant.reissued', 'secure_grant.revoked']) {
    if (!recorder.includes(`'${action}'`)) {
      fail(`${CANONICAL_FILES.recorder}: no ${action} audit action`);
    }
  }
  const issuer = codeOf(rootDir, 'issuer');
  if (!/audit\.recordIssued\(/.test(issuer) || !/audit\.recordRevoked\(/.test(issuer)) {
    fail(`${CANONICAL_FILES.issuer}: does not audit every lifecycle transition`);
  }

  // 21 — nothing secret may reach a summary, a reason or a failure code.
  const summaries = [...recorder.matchAll(/summary:\s*\{[\s\S]*?\n\s*\}/g)].map(
    (match) => match[0],
  );
  if (summaries.length === 0) {
    fail(`${CANONICAL_FILES.recorder}: no audit summary to inspect`);
  }
  for (const summary of summaries) {
    for (const forbidden of [
      'rawToken',
      'token',
      'tokenHash',
      'secret',
      'digest',
      'pepper',
      'ciphertext',
      'normalizedValue',
      'normalizedRecipient',
      'recipient',
      'truy-cap',
      '#t=',
    ]) {
      if (summary.includes(forbidden)) {
        fail(`${CANONICAL_FILES.recorder}: an audit summary carries ${forbidden}`);
      }
    }
  }
  if (/rawToken|tokenHash/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: handles token material at all`);
  }
}

/** 22, 23 — B05 creates no Custom Request and performs no APP5 action. */
function checkApp5Boundary(rootDir, fail) {
  for (const file of sources(rootDir)) {
    if (
      /insert into custom_requests|customRequests\)\.values|createCustomRequest|submitRequest/i.test(
        file.code,
      )
    ) {
      fail(`${file.path}: creates a Custom Request; that is APP5`);
    }
    for (const specifier of importSpecifiers(file.raw)) {
      if (/modules\/order|custom-request\.repository|OrderModule/.test(specifier)) {
        fail(`${file.path} imports ${specifier}; B05 does not compose the Order module`);
      }
      if (specifier.includes('apps/worker') || specifier.includes('apps/api')) {
        fail(`${file.path} imports ${specifier}; apps never import each other`);
      }
    }
    if (/acceptQuotation|approveDesign|initiatePayment|cancelOrder/i.test(file.code)) {
      fail(`${file.path}: performs an APP5/APP6/APP7 business action`);
    }
  }
}

/** 26, 27, 30, 31 — the notification stays token-free and the link is a fragment. */
function checkTransport(rootDir, fail) {
  const notifier = codeOf(rootDir, 'notifier');
  // 26 — the reference union is the only thing that reaches `params`.
  if (!/reference:\s*\{\s*kind:\s*'SECURE_ACCESS_GRANT'/.test(notifier)) {
    fail(`${CANONICAL_FILES.notifier}: does not use the closed grant reference`);
  }
  if (/params\s*:/.test(notifier)) {
    fail(`${CANONICAL_FILES.notifier}: builds intent params directly; B01 owns that shape`);
  }
  if (!/secretKind:\s*'SECURE_LINK_TOKEN'/.test(notifier)) {
    fail(`${CANONICAL_FILES.notifier}: does not set the SECURE_LINK_TOKEN discriminator`);
  }

  // 30 — the renderer uses the fragment carrier and only that.
  const renderer = codeOf(rootDir, 'renderer');
  const origin = codeOf(rootDir, 'originConfig');
  if (!/#t=/.test(origin)) {
    fail(`${CANONICAL_FILES.originConfig}: does not declare the #t= fragment carrier`);
  }
  if (!/\/truy-cap/.test(origin)) {
    fail(`${CANONICAL_FILES.originConfig}: does not declare the /truy-cap landing route`);
  }
  if (!/SECURE_LINK_FRAGMENT_PREFIX/.test(renderer) || !/SECURE_LINK_LANDING_PATH/.test(renderer)) {
    fail(`${CANONICAL_FILES.renderer}: does not compose from the declared route and carrier`);
  }
  if (/\?t=|searchParams|\btoken=\b|\/t\/\$\{/.test(renderer + origin)) {
    fail(`${CANONICAL_FILES.renderer}: carries the token in a query or path`);
  }
  // 27 — no server-visible carrier anywhere in the checkpoint.
  for (const file of sources(rootDir)) {
    if (/\?t=\$\{|[?&]token=\$\{/.test(file.code)) {
      fail(`${file.path}: builds a token-bearing query`);
    }
  }
  // No hard-coded domain: the origin is configuration, and IMP-D050 permits an
  // example value in tests only. Comments are already stripped, so the ADR-style
  // `https://<storefront-origin>` placeholders in the prose above do not count.
  for (const [path, code] of [
    [CANONICAL_FILES.originConfig, origin],
    [CANONICAL_FILES.renderer, renderer],
  ]) {
    const domain = /https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.exec(code);
    if (domain !== null) {
      fail(`${path}: hard-codes a domain (${domain[0]}); the origin is configuration`);
    }
  }

  // 31 — nothing logs the token or the rendered link.
  const delivery = codeOf(rootDir, 'deliveryUseCase');
  for (const [path, code] of [
    [CANONICAL_FILES.renderer, renderer],
    [CANONICAL_FILES.deliveryUseCase, delivery],
    ...sources(rootDir, B05_SOURCES).map((file) => [file.path, file.code]),
  ]) {
    for (const match of code.matchAll(/(logger|console)\.\w+\(([^;]*)/g)) {
      if (/secret|rawToken|token\b|secureLinkUrl|#t=/.test(match[2] ?? '')) {
        fail(`${path}: logs token or link material`);
      }
    }
  }
}

/** 28, 29 — no schema, no migration, no provider SDK. */
function checkNoSchemaOrProvider(rootDir, fail) {
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : -1;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B05 adds none`);
  }

  const providers = [
    'nodemailer',
    '@sendgrid',
    'twilio',
    'aws-sdk',
    '@aws-sdk/client-ses',
    'mailgun',
    'postmark',
    'firebase-admin',
  ];
  for (const file of sources(rootDir)) {
    if (/pgTable\(|uniqueIndex\(|alterTable|ALTER TABLE|CREATE TABLE/i.test(file.code)) {
      fail(`${file.path}: declares schema; B05 changes none`);
    }
    for (const specifier of importSpecifiers(file.raw)) {
      if (providers.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
        fail(`${file.path} imports the provider SDK ${specifier}; APP4 selects none`);
      }
    }
  }
}

export function checkApp4B05(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkNoHttpSurface(rootDir, fail);
  checkInternalCapability(rootDir, fail);
  checkTokenAuthority(rootDir, fail);
  checkScope(rootDir, fail);
  checkPolicy(rootDir, fail);
  checkActiveArbiter(rootDir, fail);
  checkReissue(rootDir, fail);
  checkRevoke(rootDir, fail);
  checkStepUpWindow(rootDir, fail);
  checkAudit(rootDir, fail);
  checkApp5Boundary(rootDir, fail);
  checkTransport(rootDir, fail);
  checkNoSchemaOrProvider(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4B05(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-b05 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app4-b05 — an internal SecureGrantIssuer with zero endpoints, zero controllers and ' +
      'no published operation; P01 minting and P01 digesting with only the hash persisted; the ' +
      'scope fixed to REQUEST_ACCESS with no action-scope model; the secure_grant policy read ' +
      'from its published key with no TTL or window literal and no fallback; CST-009 left as ' +
      'the arbiter and a duplicate issue refused rather than rotated; reissue minting a new ' +
      'grant, token, digest and expiry, revoking its source with the canonical superseded ' +
      'reason and recording the lineage, copying no ciphertext; revoke demanding a reason, ' +
      'minting nothing and offering no path back to ACTIVE; a step-up window over ' +
      'hasRecentCompleted that pins STEP_UP and cannot express SUBMISSION; issue, reissue and ' +
      'revoke audited with no token, digest, recipient or link in any summary; no Custom ' +
      'Request created and no APP5/APP6/APP7 action performed; notification only through ' +
      'APP4-B01 with a grant-reference-only params shape and no sealing here; the outbound ' +
      'link composed as /truy-cap#t= with no query or path carrier, no hard-coded domain and ' +
      'no logged token; and no schema, migration or provider SDK',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
