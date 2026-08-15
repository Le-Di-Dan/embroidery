#!/usr/bin/env node
/**
 * `APP4-A01` — the Admin customer-access support gate.
 *
 * The failures this gate exists for are the ones that ship looking correct:
 *
 * - **The lookup grows into a search.** A `q`, a `limit`, an autocomplete list,
 *   a "did you mean" — each is one small kindness, and together they are the
 *   contact-lookup oracle `ADR-APP4-001` §2.3 exists to prevent. The resolver
 *   answers with one Customer or none, and there is no second operation behind a
 *   result list.
 * - **The contact reaches the URL.** `?contact=` or `?customerId=` "so a
 *   colleague can be sent the link", and now a real person's address is in the
 *   gateway access log, the browser history and every `Referer` the page sends.
 * - **The contact is kept.** Stored "so the operator can retry", which turns a
 *   support tool into a directory of the addresses it was used on.
 * - **Notifications are matched by mask.** The masked recipient is right there
 *   on both records and comparing it looks like a join. It is a coincidence —
 *   the mask is deliberately not unique — and the wrong customer's delivery
 *   failure appears under this customer's name.
 * - **The duplicate replay is inferred.** From elapsed time, from a remembered
 *   `replayIntentId`, from the PENDING status. All three are wrong for the
 *   concurrent case the design actually names, and all three look right in a
 *   single-operator test.
 * - **`REISSUE_REQUIRED` becomes a button.** The most helpful thing a support
 *   screen could do is mint the new credential itself, and it is exactly the
 *   authority this checkpoint does not have.
 * - **Success is optimistic.** The grant flips to revoked on click, and a
 *   conflict leaves the operator looking at a lie.
 *
 * Assertions read **real source with comments stripped**, the **registry**, and
 * the **generated contract** — never prose and never the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-a01.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './check-app4-b01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ADMIN = 'apps/admin/src';
export const FEATURE_DIR = `${ADMIN}/features/customer-access-support`;

/** The one approved route. */
export const A01_ROUTE = '/support/customer-access';

export const CANONICAL_FILES = Object.freeze({
  page: `${ADMIN}/app/(protected)/support/customer-access/page.tsx`,
  index: `${FEATURE_DIR}/index.ts`,
  route: `${FEATURE_DIR}/model/customer-access-route.ts`,
  copy: `${FEATURE_DIR}/model/customer-access-copy.ts`,
  keys: `${FEATURE_DIR}/model/customer-access-keys.ts`,
  failure: `${FEATURE_DIR}/model/customer-access-failure.ts`,
  liveness: `${FEATURE_DIR}/model/grant-liveness.ts`,
  reason: `${FEATURE_DIR}/model/revoke-reason.ts`,
  service: `${FEATURE_DIR}/services/customer-access.service.ts`,
  lookupHook: `${FEATURE_DIR}/hooks/use-customer-lookup.ts`,
  queriesHook: `${FEATURE_DIR}/hooks/use-customer-support-queries.ts`,
  revokeHook: `${FEATURE_DIR}/hooks/use-grant-revocation.ts`,
  replayHook: `${FEATURE_DIR}/hooks/use-notification-replay.ts`,
  screen: `${FEATURE_DIR}/components/customer-access-screen.tsx`,
  lookupPanel: `${FEATURE_DIR}/components/customer-lookup-panel.tsx`,
  customerPanel: `${FEATURE_DIR}/components/customer-contact-panel.tsx`,
  grantPanel: `${FEATURE_DIR}/components/secure-grant-panel.tsx`,
  notificationPanel: `${FEATURE_DIR}/components/notification-panel.tsx`,
  revokeDialog: `${FEATURE_DIR}/components/revoke-dialog.tsx`,
  replayDialog: `${FEATURE_DIR}/components/replay-dialog.tsx`,
  dialog: `${FEATURE_DIR}/components/support-dialog.tsx`,
  styles: `${FEATURE_DIR}/styles/customer-access-support.scss`,
  nav: `${ADMIN}/features/admin-shell/model/admin-shell-nav.ts`,
  apiClientIndex: 'packages/api-client/src/index.ts',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

/** The five generated operations A01 consumes, and the only five. */
export const REQUIRED_OPERATIONS = Object.freeze([
  'adminCustomerSupportResolve',
  'adminCustomerSupportDetail',
  'adminCustomerSupportGrants',
  'adminSecureGrantRevoke',
  'adminNotificationIntentList',
  'adminNotificationIntentReplay',
]);

/** The 18 approved A01 rows and the evidence they must all carry. */
export const A01_APPROVAL = 'FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001';
export const A01_DESIGN_ROWS = Object.freeze([
  'FIG-ADMIN-CUSTOMERACCESS-DESKTOP-LOADING',
  'FIG-ADMIN-CUSTOMERACCESS-DESKTOP-OVERVIEW',
  'FIG-ADMIN-GRANT-DESKTOP-NONE',
  'FIG-ADMIN-GRANT-DESKTOP-ACTIVE',
  'FIG-ADMIN-GRANT-DESKTOP-REVOKECONFIRM',
  'FIG-ADMIN-GRANT-DESKTOP-REVOKING',
  'FIG-ADMIN-GRANT-DESKTOP-REVOKED',
  'FIG-ADMIN-GRANT-DESKTOP-CONFLICT',
  'FIG-ADMIN-DELIVERY-DESKTOP-NOFAILURE',
  'FIG-ADMIN-DELIVERY-DESKTOP-TERMINALFAILURE',
  'FIG-ADMIN-DELIVERY-DESKTOP-REPLAYCONFIRM',
  'FIG-ADMIN-DELIVERY-DESKTOP-REPLAYING',
  'FIG-ADMIN-DELIVERY-DESKTOP-REPLAYED',
  'FIG-ADMIN-DELIVERY-DESKTOP-REPLAYDUPLICATE',
  'FIG-ADMIN-DELIVERY-DESKTOP-REISSUEREQUIRED',
  'FIG-ADMIN-CUSTOMERACCESS-DESKTOP-LOADERROR',
  'FIG-ADMIN-CUSTOMERACCESS-DESKTOP-NOTFOUND',
  'FIG-ADMIN-CUSTOMERACCESS-NARROW-1280',
]);

const SOURCE_LIMIT = 400;
const TEST_LIMIT = 600;

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key]);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function stripped(rootDir, key) {
  return stripComments(read(rootDir, key));
}

/** Every `.ts`/`.tsx` file the feature owns, comments stripped. */
export function featureSources(rootDir) {
  const root = join(rootDir, FEATURE_DIR);
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      files.push({
        path: full
          .slice(rootDir.length + 1)
          .split('\\')
          .join('/'),
        code: stripComments(readFileSync(full, 'utf8')),
      });
    }
  };
  walk(root);
  return files;
}

/** 1, 2 — the exact route, and no alternate spelling of it. */
function checkRoute(rootDir, fail) {
  const page = join(rootDir, CANONICAL_FILES.page);
  if (!existsSync(page)) {
    fail(`${CANONICAL_FILES.page}: the canonical A01 route file is missing`);
  }

  const route = stripped(rootDir, 'route');
  if (!route.includes(`'${A01_ROUTE}'`)) {
    fail(`${CANONICAL_FILES.route}: does not declare ${A01_ROUTE}`);
  }
  // The route carries no parameter: a contact or a customer id in the URL is the
  // whole thing the body-only resolver exists to avoid.
  if (/\?|\$\{|customerId|contact/i.test(route.replace(/ADMIN_CUSTOMER_ACCESS_ROUTE/g, ''))) {
    fail(`${CANONICAL_FILES.route}: the route carries a parameter; it must be a bare path`);
  }

  // No second Admin support route anywhere under the app tree.
  const appDir = join(rootDir, ADMIN, 'app');
  const found = [];
  const walk = (dir, prefix) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      const next = entry.startsWith('(') ? prefix : `${prefix}/${entry}`;
      if (existsSync(join(full, 'page.tsx')) && /customer|support/i.test(next)) found.push(next);
      walk(full, next);
    }
  };
  walk(appDir, '');
  for (const path of found) {
    if (path !== A01_ROUTE) {
      fail(`${path} is a second Admin customer-support route; A01 owns exactly ${A01_ROUTE}`);
    }
  }
}

/** 3 — all 18 approved rows, under the amendment's approval evidence. */
function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry');
  for (const id of A01_DESIGN_ROWS) {
    const row = registry.split('\n').find((line) => line.startsWith(`| ${id} `));
    if (row === undefined) {
      fail(`${id}: no registry row`);
      continue;
    }
    if (!row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${id}: not APPROVED_FOR_IMPLEMENTATION`);
    }
    if (!row.includes(A01_APPROVAL)) {
      fail(`${id}: does not carry ${A01_APPROVAL}`);
    }
    if (!row.includes(A01_ROUTE)) {
      fail(`${id}: is not registered against ${A01_ROUTE}`);
    }
  }
}

/** 4 — the existing Admin shell, reused rather than replaced. */
function checkShellReuse(rootDir, fail) {
  const nav = stripped(rootDir, 'nav');
  if (!nav.includes('ADMIN_CUSTOMER_ACCESS_ROUTE')) {
    fail(`${CANONICAL_FILES.nav}: the support route is not in the Admin primary navigation`);
  }
  // A nav entry must reuse the capability's own constant, not a second literal.
  if (nav.includes(`'${A01_ROUTE}'`)) {
    fail(`${CANONICAL_FILES.nav}: spells the route literally instead of importing the constant`);
  }

  for (const file of featureSources(rootDir)) {
    if (/createRoot|<html|<body|new QueryClient\(/.test(file.code)) {
      fail(`${file.path}: builds a second app shell or query client`);
    }
  }
}

/** 5, 9, 21 — the generated operations, and no hand-written transport. */
function checkGeneratedClient(rootDir, fail) {
  const service = stripped(rootDir, 'service');
  for (const operation of REQUIRED_OPERATIONS) {
    if (!service.includes(operation)) {
      fail(`${CANONICAL_FILES.service}: does not use the generated ${operation}`);
    }
  }

  const index = read(rootDir, 'apiClientIndex');
  for (const operation of REQUIRED_OPERATIONS) {
    if (!index.includes(operation)) {
      fail(`${CANONICAL_FILES.apiClientIndex}: does not export ${operation}`);
    }
  }

  // `/replay`, never `/retry` — IMP-D049 PO-10 names three contracts so an
  // operator reading an audit trail can tell which of them happened.
  for (const file of featureSources(rootDir)) {
    if (/\/retry\b/.test(file.code)) {
      fail(`${file.path}: names /retry; the Admin operation is /replay`);
    }
    if (/['"`]\/api\//.test(file.code)) {
      fail(`${file.path}: hand-writes an API URL; the generated client owns every route`);
    }
    if (/\bfetch\s*\(|\baxios\b|from\s+['"]axios['"]/.test(file.code)) {
      fail(`${file.path}: reaches the network directly instead of through the generated client`);
    }
    if (/generated\/embroidery-api/.test(file.code)) {
      fail(`${file.path}: deep-imports the generated tree`);
    }
    if (/apps\/api|@embroidery\/database|drizzle-orm/.test(file.code)) {
      fail(`${file.path}: imports backend source from an Admin feature`);
    }
  }
}

/** 8, 30 — an exact lookup, never a search, and the contact never in a URL. */
function checkContactLookup(rootDir, fail) {
  const service = stripped(rootDir, 'service');
  if (!service.includes('adminCustomerSupportResolve')) {
    fail(`${CANONICAL_FILES.service}: the Customer context does not come from the B07 resolver`);
  }

  for (const file of featureSources(rootDir)) {
    // A search surface by any of its usual names. `autocomplete` is deliberately
    // absent from this list: the HTML attribute is how the browser's own memory
    // is turned *off*, and it is checked separately just below.
    if (/\b(suggest|typeahead|searchCustomers|customerSearch|datalist)\b/i.test(file.code)) {
      fail(`${file.path}: builds a customer search surface; the resolver is exact`);
    }
    // The only permitted value is `off` — anything else asks the browser to
    // remember other people's addresses in the operator's profile.
    for (const [, value] of file.code.matchAll(/autoComplete=["']([^"']*)["']/g)) {
      if (value !== 'off') {
        fail(`${file.path}: sets autoComplete="${value}" on a contact field`);
      }
    }
    // A contact in any URL-shaped position.
    if (/[?&](contact|email|phone|q)=/i.test(file.code)) {
      fail(`${file.path}: puts a contact in a query string`);
    }
    if (/(localStorage|sessionStorage)\s*\.\s*setItem/.test(file.code)) {
      fail(`${file.path}: persists support state to web storage`);
    }
    if (
      /history\.(pushState|replaceState)|router\.(push|replace)\s*\(\s*[`'"][^`'"]*contact/i.test(
        file.code,
      )
    ) {
      fail(`${file.path}: writes support state into browser history`);
    }
  }

  // The contact must not be part of any cache identity: a query key is readable
  // in devtools and retained for the life of the client.
  const keys = stripped(rootDir, 'keys');
  if (/contact|email|phone/i.test(keys)) {
    fail(`${CANONICAL_FILES.keys}: a cache key is derived from a contact value`);
  }
  const lookup = stripped(rootDir, 'lookupHook');
  if (/useQuery\s*\(/.test(lookup)) {
    fail(`${CANONICAL_FILES.lookupHook}: caches the lookup; it must be a mutation`);
  }
}

/** 9, 10, 11 — masked contacts only, and no customer mutation. */
function checkContactProjection(rootDir, fail) {
  const panel = stripped(rootDir, 'customerPanel');
  if (!panel.includes('maskedValue')) {
    fail(`${CANONICAL_FILES.customerPanel}: does not render the server's maskedValue`);
  }
  if (!panel.includes('displayName')) {
    fail(`${CANONICAL_FILES.customerPanel}: does not render the B07 displayName`);
  }

  for (const file of featureSources(rootDir)) {
    // A second masker. The mask is P01's, computed server-side; a client-side one
    // could disagree with it, and any transform of an already-masked value can
    // only make it less recognisable.
    if (/function\s+mask|\bmaskContact\b|\bmaskEmail\b|\bmaskPhone\b/.test(file.code)) {
      fail(`${file.path}: masks a contact client-side; P01 owns masking`);
    }
    if (/\b(normalizedValue|displayValue|rawContact|verifiedSource)\b/.test(file.code)) {
      fail(`${file.path}: names a contact form the API does not publish`);
    }
    // Customer mutation of any kind.
    if (
      /\b(adminCustomerUpdate|adminCustomerMerge|adminCustomerDelete|anonymize)\b/i.test(file.code)
    ) {
      fail(`${file.path}: calls a customer mutation; A01 is read-only over the Customer`);
    }
  }
}

/** 12, 13 — customer-scoped grants, and no credential anywhere. */
function checkGrantRegion(rootDir, fail) {
  const service = stripped(rootDir, 'service');
  if (!/adminCustomerSupportGrants\s*\(\s*customerId/.test(service)) {
    fail(`${CANONICAL_FILES.service}: the grant read is not scoped to the resolved Customer`);
  }

  for (const file of featureSources(rootDir)) {
    // A credential **read** — a property access or an object key — rather than
    // the mere appearance of the word. The user-facing copy legitimately names
    // these to promise they are not shown ("không hiển thị mã, digest, token"),
    // and a gate that failed on its own reassurance would be deleted.
    const credential =
      /(?:\.\s*|['"`]?\b)(tokenHash|token_hash|ciphertext|authTag|codeHash|pepper)\b\s*[.,:)\]}]/i;
    if (credential.test(file.code) || /\.\s*digest\b/i.test(file.code)) {
      fail(`${file.path}: names a credential field`);
    }
  }

  // The stale-ACTIVE row is reported truthfully, from the pair, without a
  // client-invented persisted state.
  const liveness = stripped(rootDir, 'liveness');
  if (!/expiresAt/.test(liveness) || !/status/.test(liveness)) {
    fail(`${CANONICAL_FILES.liveness}: does not read status and expiresAt together`);
  }
  // An **assignment** to `status`, not a comparison: reading `grant.status ===
  // 'REVOKED'` is exactly how the truthful derivation works.
  if (/\.\s*status\s*=(?!=)/.test(liveness)) {
    fail(`${CANONICAL_FILES.liveness}: rewrites the persisted status`);
  }
}

/** 14, 15, 16, 17 — the confirmed, reason-bearing, non-optimistic revoke. */
function checkRevokeFlow(rootDir, fail) {
  const dialog = stripped(rootDir, 'revokeDialog');
  // The **call**, not the import: leaving the import in place while bypassing the
  // validator is exactly how this rule would be defeated by accident.
  if (!/validateRevokeReason\s*\(/.test(dialog)) {
    fail(`${CANONICAL_FILES.revokeDialog}: does not validate the reason before sending`);
  }
  if (!/alertdialog|destructive/.test(dialog)) {
    fail(`${CANONICAL_FILES.revokeDialog}: is not a destructive confirmation`);
  }
  if (!/disabled=\{busy\}/.test(dialog)) {
    fail(`${CANONICAL_FILES.revokeDialog}: does not disable its controls while in flight`);
  }

  const reason = stripped(rootDir, 'reason');
  if (!/\.trim\(\)/.test(reason)) {
    fail(`${CANONICAL_FILES.reason}: does not trim the reason`);
  }

  const hook = stripped(rootDir, 'revokeHook');
  if (!hook.includes('revokeSecureGrant')) {
    fail(`${CANONICAL_FILES.revokeHook}: does not call the generated revoke`);
  }
  // Invalidation, and exactly the grants.
  if (!/invalidateQueries[\s\S]{0,120}customerAccessKeys\.grants/.test(hook)) {
    fail(`${CANONICAL_FILES.revokeHook}: does not invalidate the Customer grants query`);
  }
  if (/customerAccessKeys\.(customer|notifications)\b/.test(hook)) {
    fail(`${CANONICAL_FILES.revokeHook}: invalidates a query the revoke did not affect`);
  }
  if (/queryClient\.clear\s*\(|invalidateQueries\s*\(\s*\)/.test(hook)) {
    fail(`${CANONICAL_FILES.revokeHook}: flushes the whole Admin cache`);
  }
  // No optimistic success: nothing writes a revoked state before the response.
  if (/setQueryData|onMutate/.test(hook)) {
    fail(`${CANONICAL_FILES.revokeHook}: writes grant state optimistically`);
  }
}

/** 18, 19, 20, 25, 26 — the notification region and its safe projection. */
function checkNotificationRegion(rootDir, fail) {
  const service = stripped(rootDir, 'service');
  // Server-side narrowing on both axes: FAILED, and this Customer.
  if (!/status:\s*AdminNotificationIntentListStatus\.FAILED/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not ask the server for FAILED notifications`);
  }
  if (!/customerId/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not bind the notification list to the Customer`);
  }

  const panel = stripped(rootDir, 'notificationPanel');
  if (!panel.includes('recipientMasked')) {
    fail(`${CANONICAL_FILES.notificationPanel}: does not render the masked recipient`);
  }
  if (!panel.includes('errorClass')) {
    fail(`${CANONICAL_FILES.notificationPanel}: does not render the bounded error class`);
  }

  for (const file of featureSources(rootDir)) {
    // The binding is the server's, through the persisted contact point. Any
    // comparison of a mask, a template or a timestamp to decide ownership is the
    // inference §8 forbids.
    if (
      /recipientMasked\s*===|===\s*.*recipientMasked|recipientMasked\s*\.\s*includes/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: compares a masked recipient to bind a notification to a Customer`);
    }
    if (
      /\b(params|providerResponse|providerBody|stack|exception|outboxPayload)\b/.test(file.code)
    ) {
      fail(`${file.path}: names a notification field the API does not publish`);
    }
    // No worker polling.
    if (/refetchInterval|setInterval|refetchIntervalInBackground/.test(file.code)) {
      fail(`${file.path}: polls; APP4-W01 owns delivery and A01 does not watch it`);
    }
  }
}

/** 7, 8, 22, 23, 24 — the replay outcome and the REISSUE_REQUIRED hand-off. */
function checkReplayFlow(rootDir, fail) {
  const hook = stripped(rootDir, 'replayHook');
  if (!hook.includes('replayNotification')) {
    fail(`${CANONICAL_FILES.replayHook}: does not call the generated replay`);
  }
  // The outcome is the server's field, matched against the generated enum.
  if (!/NotificationReplayResponseOutcome\.CREATED/.test(hook)) {
    fail(`${CANONICAL_FILES.replayHook}: does not read the authoritative CREATED/EXISTING outcome`);
  }
  // And it is not inferred from anything else.
  if (/Date\.now\(\)|new Date\(|performance\.now\(/.test(hook)) {
    fail(`${CANONICAL_FILES.replayHook}: reads a clock to decide the replay outcome`);
  }
  if (/replayIntentId\s*===|previousReplayId|lastReplay/.test(hook)) {
    fail(`${CANONICAL_FILES.replayHook}: infers a duplicate from a remembered replay id`);
  }
  if (!/invalidateQueries[\s\S]{0,140}customerAccessKeys\.notifications/.test(hook)) {
    fail(`${CANONICAL_FILES.replayHook}: does not invalidate the Customer notification query`);
  }
  if (/customerAccessKeys\.(customer|grants)\b/.test(hook)) {
    fail(`${CANONICAL_FILES.replayHook}: invalidates a query the replay did not affect`);
  }

  // The three conflicts are distinct, matched by code, and only one hands off.
  const failure = stripped(rootDir, 'failure');
  for (const code of ['REISSUE_REQUIRED', 'REPLAY_NOT_APPLICABLE', 'REPLAY_SOURCE_UNAVAILABLE']) {
    if (!failure.includes(code)) {
      fail(`${CANONICAL_FILES.failure}: does not map ${code}`);
    }
  }
  // Branching on the message, not carrying it. `super(normalized.message)` gives
  // the Error a message and decides nothing; inspecting or comparing it is the
  // defect — the wording is the one field free to change without notice.
  if (
    /message\s*\.\s*(includes|match|indexOf|startsWith|endsWith|search|test)/.test(failure) ||
    /(===|==|!==)\s*[\w.]*\bmessage\b|\bmessage\b\s*(===|==|!==)/.test(failure)
  ) {
    fail(`${CANONICAL_FILES.failure}: branches on a backend message string`);
  }

  const panel = stripped(rootDir, 'notificationPanel');
  if (!panel.includes('requiresBusinessReissue')) {
    fail(`${CANONICAL_FILES.notificationPanel}: has no dedicated REISSUE_REQUIRED state`);
  }

  // 24 — A01 mints nothing and starts no business resend.
  for (const file of featureSources(rootDir)) {
    // A **call**, not a word. `reissueTitle` and `requiresBusinessReissue` are
    // how the hand-off is *named*; calling B03 resend or B05 reissue is the
    // defect, and only a call site can be one.
    if (
      /\b(issueVerificationChallenge|resendVerificationChallenge|adminSecureGrantIssue|adminSecureGrantReissue|publicVerificationIssue|publicVerificationResend)\s*\(/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: calls a business issue or resend; A01 mints nothing`);
    }
  }
}

/** 27, 28 — no APP5–APP7 action, and no backend or generated edit. */
function checkScopeBoundaries(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    if (/\b(quote|invoice|payment|checkout|order)[A-Z]/.test(file.code)) {
      fail(`${file.path}: reaches an APP5–APP7 commercial capability`);
    }
  }

  // The published surface must be exactly the A01 world this checkpoint entered
  // with — the resolver included, and nothing beside it.
  const openapi = read(rootDir, 'openapi');
  if (openapi !== '') {
    const document = JSON.parse(openapi);
    const operations = Object.values(document.paths ?? {}).reduce(
      (count, path) => count + Object.keys(path).filter((key) => key !== 'parameters').length,
      0,
    );
    if (operations !== 53) {
      fail(`the OpenAPI document publishes ${String(operations)} operations; A01 expects 53`);
    }
  }
}

/** 29 — file limits. */
function checkFileSizes(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    const lines = readFileSync(join(rootDir, file.path), 'utf8').split('\n').length;
    if (lines > SOURCE_LIMIT) {
      fail(`${file.path}: ${String(lines)} lines exceeds the ${String(SOURCE_LIMIT)}-line limit`);
    }
  }

  const testDir = join(rootDir, 'apps/admin/test/components');
  if (!existsSync(testDir)) return;
  for (const entry of readdirSync(testDir)) {
    if (!entry.startsWith('customer-access-')) continue;
    const lines = readFileSync(join(testDir, entry), 'utf8').split('\n').length;
    if (lines > TEST_LIMIT) {
      fail(
        `apps/admin/test/components/${entry}: ${String(lines)} lines exceeds ${String(TEST_LIMIT)}`,
      );
    }
  }
}

export function checkApp4A01(rootDir) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkRoute(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkShellReuse(rootDir, fail);
  checkGeneratedClient(rootDir, fail);
  checkContactLookup(rootDir, fail);
  checkContactProjection(rootDir, fail);
  checkGrantRegion(rootDir, fail);
  checkRevokeFlow(rootDir, fail);
  checkNotificationRegion(rootDir, fail);
  checkReplayFlow(rootDir, fail);
  checkScopeBoundaries(rootDir, fail);
  checkFileSizes(rootDir, fail);

  return failures;
}

const HEADLINE =
  'check:app4-a01 — one Admin support screen at /support/customer-access, reusing the delivered ' +
  'Admin shell and navigation; all 18 approved A01 rows under ' +
  'FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001; the Customer reached through the generated exact-contact ' +
  'resolver with the contact in a body and never in a URL, a query key, web storage or history, ' +
  'and no search, autocomplete or result list anywhere; contacts rendered from the server mask ' +
  'with no client-side masker and no customer mutation; Customer-scoped grants with no token, ' +
  'hash, digest or ciphertext, a stale-ACTIVE row reported from status and expiry together ' +
  'without rewriting either; a confirmed, trimmed, non-blank revoke that is never optimistic and ' +
  'invalidates the grants query alone; a FAILED, Customer-bound notification list narrowed ' +
  'server-side, projecting the masked recipient and the bounded error class with no params, ' +
  'provider body or exception, and no polling; a replay keyed on the backend’s own ' +
  'CREATED/EXISTING outcome rather than a clock or a remembered id, invalidating the notification ' +
  'query alone, with REISSUE_REQUIRED as its own state that mints nothing; and no /retry, no ' +
  'hand-written URL, no deep import, no backend import and no APP5–APP7 action';

function main() {
  const rootDir = process.argv[2] ?? REPO_ROOT;
  const failures = checkApp4A01(rootDir);
  if (failures.length > 0) {
    for (const failure of failures) {
      process.stdout.write(`  ✗ ${failure}\n`);
    }
    process.stdout.write(`\ncheck:app4-a01 — ${String(failures.length)} failure(s)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${HEADLINE}\n`);
}

if (process.argv[1] !== undefined && import.meta.url.endsWith('check-app4-a01.mjs')) {
  main();
}
