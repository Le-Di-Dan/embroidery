#!/usr/bin/env node
/**
 * `APP4-B08` — the Admin notification delivery and manual transport replay
 * contract.
 *
 * Manual replay re-sends a customer's *existing* sealed credential, and the
 * failures this gate exists for are the ones that look like fixing a bug:
 * reopening the `FAILED` intent because a new row "duplicates" it; resetting the
 * `DEAD_LETTER` event because it is already there; clearing its attempt counter
 * so the worker will take it; opening the envelope to see which challenge it was
 * for; re-sealing it because the copy "might be stale"; finding the source event
 * by querying `payload` because the linkage is not obvious; putting the Admin id
 * in the replay key so two operators do not collide; returning
 * `REISSUE_REQUIRED` for a `SATISFIED` intent because 409 is 409. Each one
 * compiles, most would pass a happy-path suite, and each either destroys
 * terminal evidence, breaks `(job_kind, job_key, attempt_no)` monotonicity, puts
 * a plaintext secret in the API process, or sends a customer a code that cannot
 * work.
 *
 * Assertions read the **generated OpenAPI document**, the **generated client**,
 * and **real source with comments stripped** — never prose, and never the
 * completion report. Every file in this checkpoint documents at length what it
 * deliberately does not do, and a gate that failed on its own explanation would
 * be deleted rather than obeyed.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-b08-contract.mjs [rootDir]
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { importSpecifiers } from './check-app4-b01.mjs';
import {
  ADMIN_GUARD,
  ADMIN_SECURITY_SCHEME,
  B07_BASELINE_OPERATIONS,
  B08_SOURCES,
  CANONICAL_FILES,
  EXPECTED_OPERATIONS,
  LIST_PATH,
  MIGRATION_COUNT,
  NO_STORE,
  REPLAY_PATH,
  REPO_ROOT,
  ROUTE_VERBS,
  checkAudit,
  checkEligibility,
  checkNoSecretHandling,
  checkReplayKey,
  checkReplayTransaction,
  checkSourceLookupAndCopy,
  codeOf,
  loadOpenApi,
  methodsOf,
  read,
  sources,
} from './check-app4-b08-replay.mjs';

// Re-exported so the mutation suite and any future consumer resolve the whole
// gate through its entry point rather than having to know which half a symbol
// lives in.
export { CANONICAL_FILES, LIST_PATH, REPLAY_PATH, REPO_ROOT };

/** 0 — every owned file exists. A deleted file must not pass by absence. */
function checkFilesExist(rootDir, fail) {
  for (const relative of B08_SOURCES) {
    if (!existsSync(join(rootDir, relative))) {
      fail(`${relative} does not exist`);
    }
  }
}

/** 1, 2, 3, 4, 37 — exactly two operations, canonical routes, no `/retry`. */
function checkPublishedSurface(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  for (const [path, verb] of ROUTE_VERBS) {
    const verbs = methodsOf(document, path);
    if (JSON.stringify(verbs) !== JSON.stringify([verb])) {
      fail(`${path} publishes [${verbs.join(', ')}]; APP4-B08 owns exactly one ${verb}`);
    }
  }

  // 4 — `retry` names what the worker does automatically to the *same*
  // delivery. A route under that name would conflate two of the three locked
  // contracts (IMP-D049 PO-10) wherever it appeared.
  for (const path of Object.keys(document.paths ?? {})) {
    if (/retry/i.test(path)) {
      fail(`${path} publishes a retry route; the Admin operation is /replay`);
    }
  }

  // 1 — and no third notification route under the Admin prefix.
  const owned = ROUTE_VERBS.map(([path]) => path);
  const notification = Object.keys(document.paths ?? {}).filter((path) =>
    /^\/api\/admin\/notification/.test(path),
  );
  const unexpected = notification.filter((path) => !owned.includes(path));
  if (unexpected.length > 0) {
    fail(`the Admin notification surface also declares [${unexpected.join(', ')}]; B08 owns two`);
  }

  // No customer-visible notification surface at all.
  for (const path of Object.keys(document.paths ?? {})) {
    if (/^\/api\/public\/.*notification/i.test(path)) {
      fail(`${path} is a customer-facing notification surface; B08 publishes none`);
    }
  }

  // 37 — the delta is exactly two operations over the accepted B07 world.
  const total = Object.keys(document.paths ?? {}).reduce(
    (count, path) => count + methodsOf(document, path).length,
    0,
  );
  if (total !== EXPECTED_OPERATIONS) {
    fail(
      `the document publishes ${String(total)} operations; expected ${String(EXPECTED_OPERATIONS)} ` +
        `— the APP4-B07 baseline of ${String(B07_BASELINE_OPERATIONS)} plus exactly B08's two`,
    );
  }

  const expectedIds = {
    [LIST_PATH]: 'adminNotificationIntent_list',
    [REPLAY_PATH]: 'adminNotificationIntent_replay',
  };
  for (const [path, verb] of ROUTE_VERBS) {
    const actual = document.paths?.[path]?.[verb]?.operationId;
    if (actual !== expectedIds[path]) {
      fail(`${path} publishes operationId "${String(actual)}"; expected ${expectedIds[path]}`);
    }
  }
}

/** 5, 6 — the exact APP1 guard, no second guard, no permission system. */
function checkAdminAuthorization(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  const controller = codeOf(rootDir, 'controller');

  if (!new RegExp(`@UseGuards\\(\\s*${ADMIN_GUARD}\\s*\\)`).test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not apply @UseGuards(${ADMIN_GUARD})`);
  }
  if (!importSpecifiers(controller).some((s) => s.includes('identity/presentation/guards'))) {
    fail(`${CANONICAL_FILES.controller}: does not import the guard from the APP1 identity module`);
  }
  // The replay mutation carries APP1's Origin allowlist, as every staff
  // mutation does. Matched as an **applied decorator**, not as a mention: the
  // import survives a deleted `@UseGuards` line and would keep a bare-name test
  // passing on an unguarded route.
  if (!/@UseGuards\([^)]*StaffOriginGuard/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the replay mutation has no Origin guard`);
  }
  for (const forbidden of [
    '\\.cookies',
    'parseCookie',
    'CookiePolicyService',
    'ResolveStaffSessionService',
    'SessionTokenService',
    'adm_session',
  ]) {
    if (new RegExp(forbidden, 'i').test(controller)) {
      fail(`${CANONICAL_FILES.controller}: reads "${forbidden}"; authentication stays APP1's`);
    }
  }

  for (const file of sources(rootDir)) {
    // 6 — no guard of B08's own, and no notification-specific permission model.
    if (/implements\s+CanActivate/.test(file.code)) {
      fail(`${file.path}: declares a guard; B08 reuses ${ADMIN_GUARD} and adds none`);
    }
    if (/\brole\b|\bRoles\b|permission|hasPermission|@RequirePermission/i.test(file.code)) {
      fail(`${file.path}: names a role or permission; APP1 has no role model`);
    }
  }

  if (document === undefined) return;
  for (const [path, verb] of ROUTE_VERBS) {
    const security = document.paths?.[path]?.[verb]?.security ?? document.security ?? [];
    const schemes = security.flatMap((entry) => Object.keys(entry));
    if (!schemes.includes(ADMIN_SECURITY_SCHEME)) {
      fail(`${path} publishes security [${schemes.join(', ')}]; expected ${ADMIN_SECURITY_SCHEME}`);
    }
  }
}

/** 7, 8, 9, 10, 11, 12, 13 — the list projection is safe and complete. */
function checkListProjection(rootDir, fail) {
  const document = loadOpenApi(rootDir, fail);
  if (document === undefined) return;

  // 7 — the filter is one closed-set status and nothing that could search.
  const parameters = document.paths?.[LIST_PATH]?.get?.parameters ?? [];
  const queryNames = parameters
    .filter((parameter) => String(parameter.in) === 'query')
    .map((parameter) => String(parameter.name));
  if (JSON.stringify(queryNames) !== JSON.stringify(['status'])) {
    fail(`${LIST_PATH} declares query parameters [${queryNames.join(', ')}]; expected [status]`);
  }
  const statusParameter = parameters.find((parameter) => String(parameter.name) === 'status');
  const statusEnum = statusParameter?.schema?.enum ?? [];
  const expectedStates = ['CANCELLED', 'FAILED', 'PENDING', 'PROCESSING', 'SATISFIED'];
  if (JSON.stringify([...statusEnum].sort()) !== JSON.stringify(expectedStates)) {
    fail(`${LIST_PATH} status filter is [${statusEnum.join(', ')}]; expected the closed state set`);
  }

  // 8, 9, 10 — the intent shape.
  const intent = document.components?.schemas?.AdminNotificationIntentResponse;
  if (intent === undefined) {
    fail('AdminNotificationIntentResponse is not published as a component');
  } else {
    const fields = Object.keys(intent.properties ?? {}).sort();
    const expected = [
      'attempts',
      'channel',
      'createdAt',
      'intentId',
      'recipientMasked',
      'status',
      'templateKey',
      'templateVersion',
    ];
    if (JSON.stringify(fields) !== JSON.stringify(expected)) {
      fail(
        `AdminNotificationIntentResponse publishes [${fields.join(', ')}]; ` +
          `expected [${expected.join(', ')}]`,
      );
    }
  }

  // 11 — the attempt shape carries the safe evidence and only that.
  const attempt = document.components?.schemas?.AdminNotificationAttemptResponse;
  if (attempt === undefined) {
    fail('AdminNotificationAttemptResponse is not published as a component');
  } else {
    const fields = Object.keys(attempt.properties ?? {}).sort();
    const expected = ['attemptedAt', 'channel', 'errorClass', 'outcome'];
    if (JSON.stringify(fields) !== JSON.stringify(expected)) {
      fail(
        `AdminNotificationAttemptResponse publishes [${fields.join(', ')}]; ` +
          `expected [${expected.join(', ')}]`,
      );
    }
  }

  // 8, 12, 13 — nothing in the published contract names a raw recipient, the
  // params, a provider body or a scheduler internal.
  const forbidden = [
    'normalizedRecipient',
    'normalized_value',
    'recipientContactPointId',
    'rawRecipient',
    'params',
    'providerMessageRef',
    'providerResponse',
    'providerBody',
    'stackTrace',
    'errorMessage',
    'exception',
    'nextAttemptAt',
    'claimedBy',
    'attemptCount',
    'intentKey',
    'sourceOutboxEventId',
    'renderedBody',
    'messageBody',
  ];
  const serialized = JSON.stringify(document);
  for (const field of forbidden) {
    if (new RegExp(`"[^"]*${field}[^"]*"\\s*:`, 'i').test(serialized)) {
      fail(`the published contract carries a "${field}" field`);
    }
  }

  // The list is a private authenticated read.
  const policy = codeOf(rootDir, 'policy');
  if (!new RegExp(`'${NO_STORE}'`).test(policy)) {
    fail(`${CANONICAL_FILES.policy}: does not declare ${NO_STORE}`);
  }
  if (/public|max-age|s-maxage/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: permits shared or timed caching of a private read`);
  }
  const controller = codeOf(rootDir, 'controller');
  if (!/@Header\('Cache-Control',\s*ADMIN_NOTIFICATION_CACHE_CONTROL\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the list does not set Cache-Control from the policy`);
  }

  // 13 — and the query never projects `params` into a view.
  const query = codeOf(rootDir, 'query');
  if (/params/.test(query)) {
    fail(`${CANONICAL_FILES.query}: reads params; the list projection must not carry it`);
  }
}

/** 34, 35, 36, 38 — scope boundaries and the generated client. */
function checkScopeAndClient(rootDir, fail) {
  // 34 — no provider SDK or body anywhere in B08.
  for (const file of sources(rootDir)) {
    for (const specifier of importSpecifiers(file.code)) {
      if (/nodemailer|twilio|sendgrid|@aws-sdk\/client-ses|firebase-admin/i.test(specifier)) {
        fail(`${file.path}: imports the provider SDK "${specifier}"`);
      }
    }
    // 36 — no APP5–APP7 business action.
    for (const term of [
      'quotation',
      'designCase',
      'paymentObligation',
      'refund',
      'productionJob',
    ]) {
      if (new RegExp(`\\b${term}`, 'i').test(file.code)) {
        fail(`${file.path}: names "${term}"; APP5–APP7 content is not B08's`);
      }
    }
  }

  // 35 — no schema and no migration.
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-B08 adds none`);
  }
  for (const file of sources(rootDir)) {
    if (/pgTable\(|uniqueIndex\(|alterTable|CREATE TABLE|ALTER TABLE/i.test(file.code)) {
      fail(`${file.path}: declares schema; B08 changes none`);
    }
  }

  // `APP4-B01`'s boundary survives: intake still reaches no business repository.
  const intake = codeOf(rootDir, 'intake');
  if (/VERIFICATION_CHALLENGE_REPOSITORY|SECURE_ACCESS_GRANT_REPOSITORY/.test(intake)) {
    fail(`${CANONICAL_FILES.intake}: intake now reads a business repository; that is B08's seam`);
  }

  // 38 — the generated client exposes replay, not retry, and no credential.
  const client = read(rootDir, 'client') ?? '';
  const schemas = read(rootDir, 'clientSchemas') ?? '';
  if (client === '') {
    fail(`${CANONICAL_FILES.client} is missing`);
    return;
  }
  for (const symbol of ['adminNotificationIntentList', 'adminNotificationIntentReplay']) {
    if (!client.includes(symbol)) {
      fail(`${CANONICAL_FILES.client}: does not export ${symbol}`);
    }
  }
  if (/adminNotificationIntentRetry|notification-intents\/\{[^}]*\}\/retry/.test(client)) {
    fail(`${CANONICAL_FILES.client}: exposes a retry operation; the Admin operation is replay`);
  }
  const generated = `${client}\n${schemas}`;
  for (const term of ['ciphertext', 'authTag', 'normalizedRecipient', 'codeHash', 'tokenHash']) {
    if (new RegExp(`\\b${term}\\b`).test(generated)) {
      fail(`the generated client names "${term}"`);
    }
  }
  if (/useQuery|useMutation|@tanstack/.test(generated)) {
    fail(`${CANONICAL_FILES.client}: carries a TanStack hook; hooks are handwritten elsewhere`);
  }
}

export function checkApp4B08(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkPublishedSurface(rootDir, fail);
  checkAdminAuthorization(rootDir, fail);
  checkListProjection(rootDir, fail);
  checkReplayTransaction(rootDir, fail);
  checkSourceLookupAndCopy(rootDir, fail);
  checkNoSecretHandling(rootDir, fail);
  checkReplayKey(rootDir, fail);
  checkEligibility(rootDir, fail);
  checkAudit(rootDir, fail);
  checkScopeAndClient(rootDir, fail);

  return failures;
}

const SUMMARY =
  'check:app4-b08-contract — exactly two published operations at the canonical Admin ' +
  'notification list and /replay routes with no /retry anywhere, both behind the delivered ' +
  'AuthenticatedAdminGuard plus the APP1 Origin allowlist on the mutation, with no second ' +
  'guard, no role model and no session parsing; a list filtered only by the closed intent ' +
  'state set, projecting the frozen masked recipient, the template reference and the ordered ' +
  'attempt timeline with a bounded error class, and carrying no raw recipient, params, ' +
  'provider body, scheduler internal or envelope field; a replay that locks the origin, ' +
  'requires it FAILED, resolves the source DEAD_LETTER event through the non-secret aggregate ' +
  'linkage and never through the payload, copies the sealed payload and its schema version ' +
  'verbatim, appends one new PENDING event whose aggregate_id is the new replay intent, and ' +
  'settles, dead-letters, re-claims or counter-touches nothing; a deterministic SHA-256 replay ' +
  'key over the locked origin-intent and dead-letter-event pair with no clock, actor, request ' +
  'or random component and no second idempotency framework; eligibility read from the typed ' +
  'secret-free reference through the delivered challenge and grant ports, refusing an ' +
  'unusable secret as REISSUE_REQUIRED and a wrong state as something else; an audit row from ' +
  'the authenticated Admin naming three ids and the fixed operation; no envelope import, open, ' +
  'seal, cipher or minter in any B08 file; and no provider SDK, schema, migration or APP5–APP7 ' +
  'business content';

function main() {
  const rootDir = process.argv[2] ?? REPO_ROOT;
  const failures = checkApp4B08(rootDir);
  if (failures.length > 0) {
    for (const failure of failures) {
      process.stdout.write(`  ✗ ${failure}\n`);
    }
    process.stdout.write(`\ncheck:app4-b08-contract — ${String(failures.length)} failure(s)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${SUMMARY}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
