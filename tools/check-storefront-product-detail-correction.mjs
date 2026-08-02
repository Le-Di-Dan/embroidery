#!/usr/bin/env node
/**
 * The `APP2-S02-C1` correction rules (IMP-D040).
 *
 * A sibling of `check-storefront-product-detail-authority.mjs`, which is at its
 * size limit; the split is by responsibility rather than by line count — this
 * file owns exactly the two facts the reviewer returned S02 for.
 *
 * **The mobile band.** `APP2-S02` inherited the APP1 shell's 16px gutter and
 * rendered a 358px content width where the approved frame locks 24px / 342px.
 * Those numbers are now written down, and drift back to 358/16 fails here.
 *
 * **The streamed not-found transport.** A data-driven `notFound()` on this
 * streamed route answers HTTP 200 with a `noindex` signal. The Product Owner
 * accepts that transport only while the response stays safe, so the safety
 * conditions are enforced as authority — and, just as importantly, a 200 must
 * never be *described* as a 404. A document that starts calling it one has
 * quietly turned a disclosed limitation into a false claim, which is the
 * failure mode this file exists to prevent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isLabelled } from './check-storefront-route-authority.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  phase: 'docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md',
});

/** The ruling this module enforces (IMP-D040). */
export const EXPECTED = Object.freeze({
  decisionId: 'IMP-D040',
  mobileGutter: '24px',
  mobileContent: '342px',
  classification: 'SAFE_STREAMED_NOT_FOUND',
  measuredStatus: '200',
  noindex: 'REQUIRED',
  productCanonical: 'FORBIDDEN',
  duplicateLookup: 'FORBIDDEN',
  followUp: 'ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1',
});

/** Widths the mobile band must never drift back to. */
export const REJECTED_MOBILE_WIDTHS = Object.freeze(['358px', '16px gutter']);

/** Vocabulary that would misdescribe a measured 200 as an exact 404. */
export const FORBIDDEN_STATUS_WORDS = Object.freeze(['HTTP_404', 'exact_404', 'transport_404']);

const RULING_HEADING = '### 6.2.4 ';

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** The bounded `### 6.2.4` correction block. */
export function correctionBlock(phaseText) {
  const start = phaseText.indexOf(RULING_HEADING);
  if (start < 0) return undefined;
  const rest = phaseText.slice(start + RULING_HEADING.length);
  const end = rest.search(/\n#{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** `| `Fact` | `Value` |` rows of the correction block's table. */
export function correctionFacts(blockText) {
  const facts = new Map();
  for (const line of blockText.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const parts = line.split('|').map((cell) => cell.trim());
    if (parts.length < 4) continue;
    facts.set(parts[1].replaceAll('`', ''), parts[2].replaceAll('`', '').replaceAll('*', ''));
  }
  return facts;
}

/** The single `| IMP-D040 |` register row. */
export function decisionRow(registerText) {
  const rows = registerText
    .split('\n')
    .filter((line) => line.startsWith(`| ${EXPECTED.decisionId} |`));
  return rows.length === 1 ? rows[0] : undefined;
}

/**
 * Lines calling the streamed response a 404, or describing the mobile story as
 * filling the shell's content width. Historical disclosure stays legal when the
 * line labels itself — the S02 report's own account of the defect must not be
 * criminalised by the correction that fixed it.
 */
export function falseStatusClaims(text) {
  return text.split('\n').filter((line) => {
    // The literal vocabulary is a violation when it *names* the response, and
    // legitimate only on a line that prohibits it — the ruling has to be able to
    // list the words it bans. That is a deliberately narrower escape than the
    // shared label test, which "not a choice made here" would have satisfied by
    // accident.
    if (FORBIDDEN_STATUS_WORDS.some((word) => line.includes(word))) {
      return !/never be called|must never|must not be called|forbidden/i.test(line);
    }
    const lower = line.toLowerCase();
    if (!/streamed/.test(lower) || !/\b404\b/.test(lower)) return false;
    return !isLabelled(line);
  });
}

/** Lines that describe the mobile column as taking the shell's width. */
export function shellWidthClaims(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!/story|description|content band|column/.test(lower)) return false;
    if (!REJECTED_MOBILE_WIDTHS.some((width) => lower.includes(width.toLowerCase()))) return false;
    if (!/fills|shell content|available content|takes the shell/.test(lower)) return false;
    return !isLabelled(line);
  });
}

/** Lines approving a proxy/middleware preflight to force the status. */
export function duplicateLookupApprovals(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!/proxy|middleware|custom server|preflight/.test(lower)) return false;
    if (!/approved|required|must|shall/.test(lower)) return false;
    return !isLabelled(line);
  });
}

function checkFacts(facts, fail) {
  const expectations = [
    ['Product detail mobile gutter', EXPECTED.mobileGutter],
    ['Product detail mobile content width', EXPECTED.mobileContent],
    ['Streamed not-found classification', EXPECTED.classification],
    ['Streamed not-found measured status', EXPECTED.measuredStatus],
    ['Streamed not-found noindex', EXPECTED.noindex],
    ['Streamed not-found product canonical', EXPECTED.productCanonical],
    ['Streamed not-found duplicate lookup', EXPECTED.duplicateLookup],
    ['Exact 404 transport follow-up', EXPECTED.followUp],
  ];
  for (const [key, expected] of expectations) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked correction fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
}

function checkDecisionRow(row, fail) {
  if (row === undefined) {
    fail(`${CANONICAL_FILES.register}: no single \`${EXPECTED.decisionId}\` row`);
    return;
  }
  if (!row.trimEnd().endsWith('| LOCKED |')) fail(`${EXPECTED.decisionId} is not LOCKED`);
  for (const [label, needle] of [
    ['the SAFE_STREAMED_NOT_FOUND classification', EXPECTED.classification],
    ['the 24px mobile gutter', EXPECTED.mobileGutter],
    ['the 342px mobile content width', EXPECTED.mobileContent],
    ['the noindex requirement', 'noindex'],
    ['the exact-404 follow-up', 'FU-APP2-DETAIL-NOT-FOUND-STATUS-01'],
  ]) {
    if (!row.includes(needle)) fail(`${EXPECTED.decisionId} does not state ${label}`);
  }
  if (!/must not be fabricated|not be fabricated/i.test(row)) {
    fail(`${EXPECTED.decisionId} does not forbid fabricating the 404 transport`);
  }
}

export function checkProductDetailCorrection(root = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const sources = Object.fromEntries(
    Object.keys(CANONICAL_FILES).map((key) => [key, read(root, key)]),
  );

  const block = sources.phase === undefined ? undefined : correctionBlock(sources.phase);
  if (block === undefined) {
    fail(`${CANONICAL_FILES.phase}: no \`${RULING_HEADING.trim()}\` correction block`);
  } else {
    checkFacts(correctionFacts(block), fail);
  }

  checkDecisionRow(
    sources.register === undefined ? undefined : decisionRow(sources.register),
    fail,
  );

  const scanned = [
    ['register', sources.register === undefined ? '' : (decisionRow(sources.register) ?? '')],
    ['phase', block ?? ''],
  ];
  for (const [key, text] of scanned) {
    for (const line of falseStatusClaims(text)) {
      fail(
        `${CANONICAL_FILES[key]}: calls the streamed 200 response a 404:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of shellWidthClaims(text)) {
      fail(
        `${CANONICAL_FILES[key]}: describes the mobile column as filling the shell width:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of duplicateLookupApprovals(text)) {
      fail(
        `${CANONICAL_FILES[key]}: approves a proxy/middleware duplicate lookup:\n    ${line.trim().slice(0, 200)}`,
      );
    }
  }

  // The follow-up may not be quietly closed: it is resolved by a framework
  // change plus new evidence, not by editing a status word.
  if (sources.phase !== undefined) {
    const resolved = sources.phase
      .split('\n')
      .filter((line) => line.includes('FU-APP2-DETAIL-NOT-FOUND-STATUS-01'))
      .filter((line) => /RESOLVED|CLOSED|DONE/i.test(line))
      .filter((line) => !isLabelled(line));
    for (const line of resolved) {
      fail(
        `${CANONICAL_FILES.phase}: marks the exact-404 follow-up resolved:\n    ${line.trim().slice(0, 200)}`,
      );
    }
  }

  return failures;
}

function main() {
  const failures = checkProductDetailCorrection();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:storefront-product-detail-correction — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:storefront-product-detail-correction — mobile band is 24px/342px and the streamed ' +
      'not-found is SAFE_STREAMED_NOT_FOUND (measured 200, noindex required, no product canonical, ' +
      'no duplicate lookup, exact-404 still routed)',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
