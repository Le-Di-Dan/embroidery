#!/usr/bin/env node
/**
 * `APP4-S01` — the Storefront contact-verification gate.
 *
 * The failures this gate exists for are the ones that ship looking correct:
 *
 * - **The code lingers.** It works, the customer verifies, and the value sits in
 *   a mutation's retained `variables`, a store, `sessionStorage` "so a reload
 *   doesn't lose it", or a `console.error(error)` on the refusal path. Every one
 *   of those passes a happy-path test.
 * - **A second masker.** The browser reformats or re-derives the destination
 *   because the server's mask "looked wrong at 390". Now two implementations
 *   disagree and one of them is not `APP4-P01`.
 * - **Resend calls issue.** Identical on screen, and a cooldown-free resend.
 * - **The replacement is not adopted.** The resend succeeds, the customer types
 *   the new code, and the client answers the cancelled challenge.
 * - **60 or 600 in the source.** Correct today, wrong the first time an operator
 *   appends a new policy value, and wrong with no code change nearby.
 * - **A hand-written URL.** Survives a route rename as a 404 nobody sees.
 *
 * Assertions read **real source with comments stripped** and the **registry**,
 * never prose and never the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-s01.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './check-app4-b01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const STOREFRONT = 'apps/storefront/src';
export const FEATURE_DIR = `${STOREFRONT}/features/contact-verification`;

/** The one approved route. */
export const S01_ROUTE = 'xac-minh-lien-he';

export const CANONICAL_FILES = Object.freeze({
  page: `${STOREFRONT}/app/${S01_ROUTE}/page.tsx`,
  index: `${FEATURE_DIR}/index.ts`,
  client: `${FEATURE_DIR}/api/verification.client.ts`,
  controller: `${FEATURE_DIR}/hooks/use-contact-verification.ts`,
  state: `${FEATURE_DIR}/model/verification-state.ts`,
  outcome: `${FEATURE_DIR}/model/verification-outcome.ts`,
  copy: `${FEATURE_DIR}/model/verification-copy.ts`,
  contact: `${FEATURE_DIR}/model/contact-draft.ts`,
  screen: `${FEATURE_DIR}/ui/contact-verification-screen.tsx`,
  codeEntry: `${FEATURE_DIR}/ui/code-entry-card.tsx`,
  codeInput: `${FEATURE_DIR}/ui/code-input.tsx`,
  provider: `${FEATURE_DIR}/ui/verification-query-provider.tsx`,
  styles: `${FEATURE_DIR}/styles/contact-verification.scss`,
  apiClientIndex: 'packages/api-client/src/index.ts',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

/** The generated operations S01 is allowed to reach, and the only ones. */
export const REQUIRED_OPERATIONS = Object.freeze([
  'publicVerificationIssue',
  'publicVerificationResend',
  'publicVerificationSubmitAttempt',
  'publicVerificationReadStatus',
]);

/** The registry rows this checkpoint consumes; all must be approved. */
export const S01_DESIGN_ROWS = Object.freeze([
  'FIG-VERIFY-CONTACT-DESKTOP-DEFAULT',
  'FIG-VERIFY-CONTACT-DESKTOP-INVALID',
  'FIG-VERIFY-CONTACT-DESKTOP-SUBMITTING',
  'FIG-VERIFY-CODE-DESKTOP-SENT',
  'FIG-VERIFY-CODE-DESKTOP-VERIFYING',
  'FIG-VERIFY-CODE-DESKTOP-MISMATCH',
  'FIG-VERIFY-CODE-DESKTOP-COOLDOWN',
  'FIG-VERIFY-CODE-DESKTOP-RESENT',
  'FIG-VERIFY-CODE-DESKTOP-EXPIRED',
  'FIG-VERIFY-CODE-DESKTOP-LOCKOUT',
  'FIG-VERIFY-CONTACT-DESKTOP-RATELIMITED',
  'FIG-VERIFY-CODE-DESKTOP-SUCCESS',
  'FIG-VERIFY-CONTACT-DESKTOP-ERROR',
  'FIG-VERIFY-CONTACT-MOBILE-DEFAULT',
  'FIG-VERIFY-CODE-MOBILE-SENT',
  'FIG-VERIFY-CODE-MOBILE-COOLDOWN',
  'FIG-VERIFY-CODE-MOBILE-LOCKOUT',
  'FIG-VERIFY-CODE-MOBILE-SUCCESS',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key]);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Every runtime source file the feature owns, comments stripped. */
export function featureSources(rootDir) {
  const base = join(rootDir, FEATURE_DIR);
  if (!existsSync(base)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        files.push({
          path: full.slice(join(rootDir, '').length).replace(/\\/g, '/'),
          code: stripComments(readFileSync(full, 'utf8')),
        });
      }
    }
  };
  walk(base);
  const page = join(rootDir, CANONICAL_FILES.page);
  if (existsSync(page)) {
    files.push({
      path: CANONICAL_FILES.page,
      code: stripComments(readFileSync(page, 'utf8')),
    });
  }
  return files;
}

/** 1, 2 — exactly one verification route, at the approved slug. */
function checkRoute(rootDir, fail) {
  if (!existsSync(join(rootDir, CANONICAL_FILES.page))) {
    fail(`${CANONICAL_FILES.page}: the approved route does not exist`);
  }
  const appDir = join(rootDir, STOREFRONT, 'app');
  if (!existsSync(appDir)) return;
  /*
   * No alternate verification surface.
   *
   * A second route is how a "temporary" debug page or an English-slug duplicate
   * outlives the checkpoint that added it, and both would be reachable.
   */
  for (const entry of readdirSync(appDir)) {
    if (entry === S01_ROUTE) continue;
    if (/verif|xac-minh|xacminh|otp|verification/i.test(entry)) {
      fail(`apps/storefront/src/app/${entry}: a second verification route exists`);
    }
  }
}

/** 3 — every consumed registry row is approved, not merely present. */
function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry');
  if (registry === undefined) {
    fail(`${CANONICAL_FILES.registry}: missing`);
    return;
  }
  for (const id of S01_DESIGN_ROWS) {
    const row = registry.split('\n').find((line) => line.startsWith(`| ${id} `));
    if (row === undefined) {
      fail(`${CANONICAL_FILES.registry}: row ${id} is missing`);
      continue;
    }
    if (!row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: row ${id} is not APPROVED_FOR_IMPLEMENTATION`);
    }
    if (!row.includes('FIG-APPROVAL-APP4-D01-PO-001')) {
      fail(`${CANONICAL_FILES.registry}: row ${id} carries no approval evidence`);
    }
  }
}

/** 4, 5 — the generated client is the only transport, and no URL is written. */
function checkGeneratedClient(rootDir, fail) {
  const client = stripComments(read(rootDir, 'client') ?? '');
  for (const operation of REQUIRED_OPERATIONS) {
    if (!client.includes(operation)) {
      fail(`${CANONICAL_FILES.client}: does not use the generated ${operation}`);
    }
  }
  if (!/from '@embroidery\/api-client'/.test(client)) {
    fail(`${CANONICAL_FILES.client}: does not import from the api-client boundary`);
  }
  // The curated boundary, never the generated tree. Comments are stripped
  // first: `index.ts` explains why the status read is exported, and a gate that
  // accepted its own rationale as the export would prove nothing.
  const boundary = stripComments(read(rootDir, 'apiClientIndex') ?? '');
  for (const operation of REQUIRED_OPERATIONS) {
    if (!boundary.includes(operation)) {
      fail(`${CANONICAL_FILES.apiClientIndex}: does not export ${operation}`);
    }
  }
  for (const file of featureSources(rootDir)) {
    if (/from '.*generated\//.test(file.code)) {
      fail(`${file.path}: deep-imports the generated client tree`);
    }
    if (
      /['"`]\/api\/|['"`]\/public\/verification|axios\.(get|post|put|delete)|fetch\(/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: hard-codes an API URL or bypasses the generated client`);
    }
  }
}

/** 6, 7, 8, 9 — the code reaches no store, no storage, no URL and no log. */
function checkCodeSecrecy(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    if (/zustand|createStore|useStore\(/.test(file.code)) {
      fail(`${file.path}: uses a store; S01 state is a local reducer (§10)`);
    }
    if (/localStorage|sessionStorage|document\.cookie|indexedDB/.test(file.code)) {
      fail(`${file.path}: persists to browser storage`);
    }
    if (
      /history\.(pushState|replaceState)|searchParams\.set|useRouter\(\)\.(push|replace)/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: writes to the URL or history`);
    }
    if (/console\.(log|info|warn|error|debug)|analytics|gtag|dataLayer/.test(file.code)) {
      fail(`${file.path}: logs or reports; a refusal path must carry no payload`);
    }
  }
  /*
   * The mutation must not retain the code.
   *
   * `mutate()` is called with no argument and the value is read from a ref
   * inside `mutationFn`, so TanStack's retained `variables` is permanently
   * undefined. A `mutate(code)` would be the ordinary way to write this and the
   * one that leaves the secret in the mutation cache.
   */
  const controller = stripComments(read(rootDir, 'controller') ?? '');
  if (!/codeRef/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the code is not held in a ref`);
  }
  if (/\.mutate\(\s*[A-Za-z_{]/.test(controller)) {
    fail(
      `${CANONICAL_FILES.controller}: passes variables to a mutation; the code could ride along`,
    );
  }
  if (!/attempt\.reset\(\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not reset the attempt mutation on settlement`);
  }
  // Cleared on every exit from code entry.
  for (const needle of ['clearCode', 'useEffect(() => clearCode']) {
    if (!controller.includes(needle)) {
      fail(`${CANONICAL_FILES.controller}: no ${needle}; the code is not cleared on every exit`);
    }
  }
}

/** 10 — no policy duration is restated in runtime source. */
function checkNoPolicyLiterals(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    // 60 and 600 seconds, and their millisecond forms. The timer derives from
    // `resendAvailableAt`, so none of these has any reason to appear.
    if (/\b(60000|600000|60_000|600_000)\b/.test(file.code)) {
      fail(`${file.path}: restates a policy duration in milliseconds`);
    }
    if (/(cooldown|ttl|expiry|resend)\w*\s*[:=]\s*6?00?\b/i.test(file.code)) {
      fail(`${file.path}: hard-codes a policy duration`);
    }
  }
  const state = stripComments(read(rootDir, 'state') ?? '');
  if (!/resendAvailableAt/.test(state)) {
    fail(`${CANONICAL_FILES.state}: the cooldown is not derived from the server instant`);
  }
}

/** 11, 12 — resend uses the resend operation and adopts the replacement. */
function checkResend(rootDir, fail) {
  const client = stripComments(read(rootDir, 'client') ?? '');
  if (!/resendVerificationChallenge[\s\S]*?publicVerificationResend/.test(client)) {
    fail(`${CANONICAL_FILES.client}: resend does not call the resend operation`);
  }
  // The resend service must not reach the issue operation at all.
  const resendBody = client.slice(
    client.indexOf('export async function resendVerificationChallenge'),
  );
  const nextExport = resendBody.indexOf('export async function submitVerificationAttempt');
  if (
    /publicVerificationIssue/.test(resendBody.slice(0, nextExport < 0 ? undefined : nextExport))
  ) {
    fail(`${CANONICAL_FILES.client}: resend reaches the issue operation`);
  }
  const controller = stripComments(read(rootDir, 'controller') ?? '');
  if (!/RESEND_SUCCEEDED[\s\S]{0,120}toChallenge\(response\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a successful resend does not adopt the new challenge`);
  }
  const state = stripComments(read(rootDir, 'state') ?? '');
  if (!/case 'RESEND_SUCCEEDED':[\s\S]{0,320}challenge: action\.challenge/.test(state)) {
    fail(`${CANONICAL_FILES.state}: the resend does not replace the challenge identity`);
  }
}

/** 13, 14 — no account surface, and no APP5 business action. */
function checkScope(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    if (
      /password|register|signIn|signUp|logout|profile|account|customRequest|quotation|deposit/i.test(
        file.code,
      )
    ) {
      fail(`${file.path}: reaches for an account, profile or APP5+ business concept`);
    }
    // Non-enumeration: no copy may distinguish a known contact from an unknown.
    if (/đã đăng ký|chưa đăng ký|tìm thấy khách hàng|tài khoản đã tồn tại/i.test(file.code)) {
      fail(`${file.path}: carries enumerating copy (634:59)`);
    }
  }
}

/** 16 — no second contact normalization or masking implementation. */
function checkNoSecondPrimitive(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    if (/maskContact|maskEmail|maskPhone|\*\*\*/.test(file.code)) {
      fail(`${file.path}: masks a contact; APP4-P01 on the server is the only masking authority`);
    }
    if (/toE164|parsePhoneNumber|libphonenumber|normalizeEmail|normalizePhone/.test(file.code)) {
      fail(`${file.path}: normalizes a contact; the server is the canonical normalizer`);
    }
    if (/from '.*apps\/api/.test(file.code)) {
      fail(`${file.path}: imports from apps/api`);
    }
  }
  // The mask is rendered from the response field and nothing else.
  const codeEntry = stripComments(read(rootDir, 'codeEntry') ?? '');
  if (!/challenge\.recipientMasked/.test(codeEntry)) {
    fail(`${CANONICAL_FILES.codeEntry}: does not render the server's masked destination`);
  }
}

/** 15 — no backend, OpenAPI, schema or migration change belongs to S01. */
function checkNoBackendChange(rootDir, fail) {
  const openapi = read(rootDir, 'openapi');
  if (openapi === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(openapi);
  const paths = Object.keys(document.paths ?? {});
  // S01 publishes no route of its own; the four it consumes are B03's and B04's.
  const verification = paths.filter((path) => path.includes('/verification/'));
  if (verification.length !== 4) {
    fail(`the verification surface is ${verification.length} paths; S01 adds none`);
  }
  if (
    document.components?.schemas?.VerificationChallengeResponse?.properties?.recipientMasked ===
    undefined
  ) {
    fail('VerificationChallengeResponse publishes no recipientMasked; S01 has no mask to render');
  }
}

/** The code is a six-character string, and never a number. */
function checkCodeShape(rootDir, fail) {
  const input = stripComments(read(rootDir, 'codeInput') ?? '');
  if (!/VERIFICATION_CODE_LENGTH = 6/.test(input)) {
    fail(`${CANONICAL_FILES.codeInput}: the code length is not six`);
  }
  if (/parseInt|Number\(|\+code\b/.test(input)) {
    fail(`${CANONICAL_FILES.codeInput}: parses the code as a number; a leading zero would be lost`);
  }
  if (!/autoComplete="one-time-code"/.test(input)) {
    fail(`${CANONICAL_FILES.codeInput}: no one-time-code autocomplete (634:142)`);
  }
  if (!/inputMode="numeric"/.test(input)) {
    fail(`${CANONICAL_FILES.codeInput}: no numeric input mode (634:142)`);
  }
}

/** File-size limits, which this feature is close enough to for it to matter. */
function checkFileSizes(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    const lines = readFileSync(join(rootDir, file.path), 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${file.path}: ${lines} lines exceeds the 400-line source limit`);
    }
  }
}

export function checkApp4S01(rootDir, fail) {
  checkRoute(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkGeneratedClient(rootDir, fail);
  checkCodeSecrecy(rootDir, fail);
  checkNoPolicyLiterals(rootDir, fail);
  checkResend(rootDir, fail);
  checkScope(rootDir, fail);
  checkNoSecondPrimitive(rootDir, fail);
  checkNoBackendChange(rootDir, fail);
  checkCodeShape(rootDir, fail);
  checkFileSizes(rootDir, fail);
}

const HEADLINE =
  'check:app4-s01 — the Storefront contact verification on exactly the eighteen approved APP4-D01 ' +
  'rows, at the one route /xac-minh-lien-he with no alternate verification surface; every call ' +
  'through a generated operation exported from the curated api-client boundary, with no hand-written ' +
  'URL, no deep import of the generated tree and no raw fetch or axios; the verification code held ' +
  'in a ref and passed to a mutation that carries no variables, reset on settlement and cleared on ' +
  'every exit including unmount, with no store, no localStorage, sessionStorage, cookie or ' +
  'indexedDB, no URL or history write, and no console, analytics or beacon anywhere in the feature; ' +
  'the cooldown derived from the server resendAvailableAt with no 60 or 600 restated in runtime ' +
  'source; resend calling the resend operation rather than issue and adopting the replacement ' +
  'challenge identity; the masked destination rendered from the response field alone, with no ' +
  'masking or normalization primitive reimplemented and no import from apps/api; a six-character ' +
  'string code with one-time-code autocomplete and numeric input mode, never parsed as a number; no ' +
  'account, profile or APP5 business concept and no enumerating copy; and a verification surface ' +
  'still four paths, so S01 published none of its own.';

if (process.argv[1]?.endsWith('check-app4-s01.mjs')) {
  const failures = [];
  checkApp4S01(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(HEADLINE);
}
