#!/usr/bin/env node
/**
 * Storefront route-authority consistency gate (`APP2-S01-G01`).
 *
 * `APP2-S01` blocked at its route gate because the Storefront Discover route had
 * never been decided anywhere: the app carried one browser route (`/`), the shell's
 * `discover` item was deliberately `route: null`, and the only path in the vicinity —
 * `/san-pham/<slug>` — was drawn in Figma as a proposal. Nothing mechanical held the
 * line between "a path appears in a document" and "a path is authorised", which is
 * exactly how a proposal becomes an invented route.
 *
 * This gate holds that line. `/kham-pha` must remain the single canonical Discover
 * route across the governance set (IMP-D038), the Homepage must keep `/`, the category
 * query contract must not drift, no document may quietly promote a Discover alias, and
 * no document may require an S01 card to link before that link is implemented.
 *
 * **Superseded on two facts by `APP2-S02-G01` (IMP-D039).** Until that gate this checker
 * also asserted `Product detail browser route` = `UNRESOLVED` and `APP2-S02 status` =
 * `BLOCKED_BY_UI03_RECONCILIATION`, and treated `/san-pham` as a permanently rejected
 * path. Those assertions existed to hold the line *until a real ruling arrived*, and it
 * has: the Product Owner locked `/san-pham/[slug]`. The expectations move with the
 * ruling rather than being deleted, so the fact table stays machine-checked in exactly
 * one place; ownership of every Product-Detail-specific fact — the operation, the media
 * rendition, the single description section, hidden price/stock, the deferred scope, and
 * the rule that S02 may only be `READY` once its approval exists — passes to
 * `check-storefront-product-detail-authority.mjs`.
 *
 * Deliberately narrow. It reads one fact table, one register row and a bounded ruling
 * block in named files — it is not a Markdown parser and must never become one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The documents that may state Storefront route authority. */
export const CANONICAL_FILES = Object.freeze({
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  phase: 'docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  traceability: 'docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md',
  designIndex: 'docs/design/FIGMA_DESIGN_INDEX.md',
});

/** The ruling this gate enforces (IMP-D038). */
export const EXPECTED = Object.freeze({
  decisionId: 'IMP-D038',
  discoverRoute: '/kham-pha',
  homeRoute: '/',
  categoryQueryKey: 'category',
  categorySlugs: ['thu-bong', 'khan', 'quan-ao', 'khac'],
  cardInteraction: 'NON_INTERACTIVE',
  /** Resolved by IMP-D039; `check-storefront-product-detail-authority.mjs` owns its detail. */
  detailRoute: '/san-pham/[slug]',
  s02Status: 'READY',
});

/**
 * Paths that must never become the canonical Discover route or an approved Discover alias.
 * `/san-pham` left this list when IMP-D039 made it the Product Detail base — it is not
 * unguarded, it is guarded by the Product Detail gate instead.
 *
 * `/studio` and `/editor` joined the list with `APP3-S01`, and for the same
 * reason the original three are on it: each is a plausible-looking top-level
 * path that no ruling has ever authorised. S01 put the Studio at
 * `/san-pham/[slug]/thiet-ke`, a child of the Product Detail route, because a
 * design session is opened on one exact placement and a top-level Studio could
 * not name one. `check-app3-s01.mjs` owns the positive Studio ruling; this list
 * only holds the line that neither spelling may be promoted here.
 */
export const REJECTED_PATHS = Object.freeze([
  '/discover',
  '/catalog',
  '/products',
  '/studio',
  '/editor',
]);

/** The heading that opens the bounded ruling block inside the phase plan. */
const RULING_HEADING = '### 6.2.2 ';

/** Words that turn a mention of a path into a claim that it is authorised. */
const CLAIM_WORDS = ['canonical', 'approved', 'alias'];

/**
 * Words that make such a sentence a denial or an explicit label instead of a claim.
 * Without these the ruling itself — which must name what it rejects — would fail the
 * gate it introduces.
 */
const LABELS = [
  'not ',
  'not_',
  'no ',
  'never',
  'rejected',
  'reject',
  'proposal',
  'chưa chốt',
  'unresolved',
  'withheld',
  'historical',
  'superseded',
  'cannot',
];

/** Words that turn a mention of a card link into a requirement to render one. */
const REQUIREMENT_WORDS = ['must', 'required', 'shall'];

function read(root, key) {
  return readFileSync(join(root, CANONICAL_FILES[key]), 'utf8');
}

export function isLabelled(line) {
  const lower = line.toLowerCase();
  return LABELS.some((label) => lower.includes(label));
}

/** The bounded `### 6.2.2` ruling block, so scans never run over neighbouring rows. */
export function rulingBlock(phaseText) {
  const start = phaseText.indexOf(RULING_HEADING);
  if (start < 0) return undefined;
  const rest = phaseText.slice(start + RULING_HEADING.length);
  const end = rest.search(/\n#{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** `| `Fact` | `Value` |` rows of the ruling block's machine-checked table. */
export function routeFacts(blockText) {
  const facts = new Map();
  for (const line of blockText.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const parts = line.split('|').map((cell) => cell.trim());
    if (parts.length < 4) continue;
    facts.set(parts[1].replaceAll('`', ''), parts[2].replaceAll('`', '').replaceAll('*', ''));
  }
  return facts;
}

/** The single `| IMP-D038 |` register row. */
export function decisionRow(registerText) {
  const rows = registerText
    .split('\n')
    .filter((line) => line.startsWith(`| ${EXPECTED.decisionId} |`));
  return rows.length === 1 ? rows[0] : undefined;
}

/** Lines promoting a rejected path to canonical/approved/alias without a label. */
export function aliasPromotions(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!REJECTED_PATHS.some((path) => lower.includes(path))) return false;
    if (!CLAIM_WORDS.some((word) => lower.includes(word))) return false;
    return !isLabelled(line);
  });
}

/** Lines requiring an S01 card to carry a link before S02 route authority exists. */
export function cardLinkRequirements(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!lower.includes('card')) return false;
    if (!lower.includes('href') && !lower.includes('link')) return false;
    if (!REQUIREMENT_WORDS.some((word) => lower.includes(word))) return false;
    return !isLabelled(line);
  });
}

/**
 * Any claim that `APP2-S02` is ready or approved. Matched on the identifier plus a
 * short copula rather than per line, because the roadmap keeps every APP2 status in
 * one very long table row alongside `APP2-S01` = `READY — NOT STARTED`.
 *
 * Still exported, but no longer *failed on* here: since IMP-D039 a readiness claim is
 * legitimate, and whether it is **earned** is a Product-Detail question. The detail gate
 * imports this and pairs each claim with the approval evidence it requires.
 */
export function s02ReadinessClaims(text) {
  // `COMPLETE` counts too, and for the same reason: claiming S02 is finished
  // without the approval that authorised it is a stronger version of claiming it
  // is ready. Added when `APP2-S02` shipped and the `READY`-only scan silently
  // stopped matching anything.
  return [
    ...text.matchAll(/APP2-S02`?\**\s*(?:=|is)\s*\**`?(READY|COMPLETE|APPROVED[A-Z_]*)/g),
  ].map((match) => match[0]);
}

function checkFacts(facts, fail) {
  const expectations = [
    ['APP2-S01 discover route', EXPECTED.discoverRoute],
    ['Homepage route', EXPECTED.homeRoute],
    ['Category query key', EXPECTED.categoryQueryKey],
    ['Category slugs', EXPECTED.categorySlugs.join(', ')],
    ['S01 product card interaction', EXPECTED.cardInteraction],
    ['Product detail browser route', EXPECTED.detailRoute],
    ['APP2-S02 status', EXPECTED.s02Status],
  ];
  for (const [key, expected] of expectations) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked route fact \`${key}\` is missing`);
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
  if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${EXPECTED.decisionId} is not LOCKED`);
  }
  if (!row.includes(EXPECTED.discoverRoute)) {
    fail(`${EXPECTED.decisionId} does not state the Discover route ${EXPECTED.discoverRoute}`);
  }
  if (!row.includes(`?${EXPECTED.categoryQueryKey}=`)) {
    fail(`${EXPECTED.decisionId} does not state the \`?${EXPECTED.categoryQueryKey}=\` state`);
  }
  for (const slug of EXPECTED.categorySlugs) {
    if (!row.includes(slug)) fail(`${EXPECTED.decisionId} omits the fixed category \`${slug}\``);
  }
  if (!/non-interactive/i.test(row)) {
    fail(`${EXPECTED.decisionId} does not authorize non-interactive S01 product cards`);
  }
  // The `APP2-S02` status is deliberately *not* asserted against this row. IMP-D038 is a
  // dated ruling that correctly records S02 as blocked at the time it was made; that
  // sentence is history and must not be rewritten. The live status is the fact table's,
  // and whether S02 has earned it is `check-storefront-product-detail-authority.mjs`'s.
}

export function checkStorefrontRouteAuthority(root = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const sources = Object.fromEntries(
    Object.keys(CANONICAL_FILES).map((key) => [key, read(root, key)]),
  );

  const block = rulingBlock(sources.phase);
  if (block === undefined) {
    fail(`${CANONICAL_FILES.phase}: no \`${RULING_HEADING.trim()}\` route-authority block`);
  } else {
    checkFacts(routeFacts(block), fail);
    if (!block.includes(EXPECTED.s02Status)) {
      fail(`${CANONICAL_FILES.phase}: the ruling block does not keep S02 ${EXPECTED.s02Status}`);
    }
    for (const root_ of ['261:1290', '262:1291', '273:1409', '279:1504']) {
      if (!block.includes(root_)) {
        fail(`${CANONICAL_FILES.phase}: the ruling block omits UI03 root ${root_}`);
      }
    }
  }

  checkDecisionRow(decisionRow(sources.register), fail);

  for (const key of ['roadmap', 'traceability', 'designIndex']) {
    if (!sources[key].includes(EXPECTED.discoverRoute)) {
      fail(`${CANONICAL_FILES[key]}: does not record the Discover route ${EXPECTED.discoverRoute}`);
    }
  }

  const scanned = [
    ['register', decisionRow(sources.register) ?? ''],
    ['phase', block ?? ''],
  ];
  for (const [key, text] of scanned) {
    for (const line of aliasPromotions(text)) {
      fail(
        `${CANONICAL_FILES[key]}: promotes a rejected path to canonical/approved:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of cardLinkRequirements(text)) {
      fail(
        `${CANONICAL_FILES[key]}: requires an S01 card link before S02 route authority:\n    ${line.trim().slice(0, 200)}`,
      );
    }
  }

  return failures;
}

function main() {
  const failures = checkStorefrontRouteAuthority();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:storefront-route-authority — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:storefront-route-authority — Discover is /kham-pha with ?category=<slug> and staged non-interactive cards across 5 canonical documents; no Discover alias is approved (Product Detail authority is gated separately by check:storefront-product-detail-authority)',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
