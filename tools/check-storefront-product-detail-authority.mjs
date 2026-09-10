#!/usr/bin/env node
/**
 * Storefront Product Detail authority gate (`APP2-S02-G01`).
 *
 * `APP2-S02` was `BLOCKED_BY_UI03_RECONCILIATION` for two independent reasons: the UI03
 * draft was never approved, and no Product Detail browser route existed. The gate that
 * cured it had to decide, in one place, both *where* the page lives and *what the page
 * may show* — because the delivered `publicProductDetail` contract represents far less
 * than UI03 drew. Every removed section (materials, craft process, related works,
 * save/favourite, commission) is a thing a future checkpoint could plausibly re-add by
 * reading the draft instead of the contract, and every re-addition would need a backend
 * field that does not exist.
 *
 * This gate holds that line. The route must stay `/san-pham/[slug]` with no alias; the
 * page must consume exactly one operation and one media rendition; `description` must map
 * to exactly one section; price and stock must stay hidden even though the contract
 * returns them; the deferred scope must stay deferred; the S01 card upgrade must stay
 * `APP2-S02` work; and — the half that protects the *previous* checkpoint's honesty —
 * `APP2-S02` may only be called `READY` while its approval record actually exists, and
 * the UI03 roots must remain recorded rather than deleted.
 *
 * Deliberately narrow. It reads one fact table, one register row, one approval file and a
 * bounded ruling block in named files — it is not a Markdown parser and must never
 * become one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isLabelled, s02ReadinessClaims } from './check-storefront-route-authority.mjs';
// Pure line scanners live beside this file so the gate itself stays about the ruling.
import {
  REJECTED_DETAIL_PATHS,
  UI03_ROOTS,
  commerceRequirements,
  deferredScopeRequirements,
  detailAliasPromotions,
  originalMediaAllowances,
  storyFieldRequirements,
  ui03AuthorityClaims,
} from './check-storefront-product-detail-authority.scan.mjs';
// Registry authority — which nodes currently carry implementation authority for
// this page, and which are recorded history (`APP12-E01` §3.9).
import {
  RECONCILED_ROOTS,
  checkRegistry,
} from './check-storefront-product-detail-authority.registry.mjs';

export { RECONCILED_ROOTS };

export {
  REJECTED_DETAIL_PATHS,
  UI03_ROOTS,
  commerceRequirements,
  deferredScopeRequirements,
  detailAliasPromotions,
  originalMediaAllowances,
  storyFieldRequirements,
  ui03AuthorityClaims,
};

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The documents that may state Product Detail authority. */
export const CANONICAL_FILES = Object.freeze({
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  phase: 'docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  traceability: 'docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md',
  designIndex: 'docs/design/FIGMA_DESIGN_INDEX.md',
  approval: 'docs/design/approvals/APP2-S02-G01-PRODUCT-DETAIL-DESIGN-APPROVAL.md',
});

/** The ruling this gate enforces (IMP-D039). */
export const EXPECTED = Object.freeze({
  decisionId: 'IMP-D039',
  approvalId: 'FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001',
  detailRoute: '/san-pham/[slug]',
  operation: 'publicProductDetail',
  mediaRendition: 'catalog-preview',
  descriptionSections: '1',
  priceDisplay: 'HIDDEN',
  deferredScope: 'materials, process, related, save, commission',
  cardUpgradeOwner: 'APP2-S02',
  designAuthorityNode: '529:2224',
  s02Status: 'READY',
  /**
   * `APP2-S02-G01-C1`. The gate as first delivered *claimed* a readable single-column story
   * measure while the reconciled nodes rendered `description` across the full content band
   * (1280px desktop, 928px tablet) — removing the draft's `StoryMedia` column had let the
   * remaining text `FILL` the row. The written measure is now machine-checked so the claim
   * and the number cannot drift apart again.
   */
  descriptionMeasure: '640px',
  descriptionMeasureMobile: '342px content width',
});

/** Widths the description must never be described as occupying on desktop/tablet. */
export const REJECTED_MEASURES = Object.freeze(['1280px', '928px']);

/** The sentence the canonical authority must carry verbatim. */
export const MEASURE_RULE =
  'maximum readable measure of 640px on Desktop and Tablet; Mobile uses its 342px content width';

/** The heading that opens the bounded ruling block inside the phase plan. */
const RULING_HEADING = '### 6.2.3 ';

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** The bounded `### 6.2.3` ruling block, so scans never run over neighbouring rows. */
export function rulingBlock(phaseText) {
  const start = phaseText.indexOf(RULING_HEADING);
  if (start < 0) return undefined;
  const rest = phaseText.slice(start + RULING_HEADING.length);
  const end = rest.search(/\n#{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** `| `Fact` | `Value` |` rows of the ruling block's machine-checked table. */
export function detailFacts(blockText) {
  const facts = new Map();
  for (const line of blockText.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const parts = line.split('|').map((cell) => cell.trim());
    if (parts.length < 4) continue;
    facts.set(parts[1].replaceAll('`', ''), parts[2].replaceAll('`', '').replaceAll('*', ''));
  }
  return facts;
}

/** The single `| IMP-D039 |` register row. */
export function decisionRow(registerText) {
  const rows = registerText
    .split('\n')
    .filter((line) => line.startsWith(`| ${EXPECTED.decisionId} |`));
  return rows.length === 1 ? rows[0] : undefined;
}

function checkFacts(facts, fail) {
  const expectations = [
    ['Product detail route', EXPECTED.detailRoute],
    ['Product detail operation', EXPECTED.operation],
    ['Product detail media rendition', EXPECTED.mediaRendition],
    ['Description sections', EXPECTED.descriptionSections],
    ['Price and stock display', EXPECTED.priceDisplay],
    ['Deferred scope', EXPECTED.deferredScope],
    ['S01 card link upgrade owner', EXPECTED.cardUpgradeOwner],
    ['APP2-S02 design authority', EXPECTED.designAuthorityNode],
    ['APP2-S02 status', EXPECTED.s02Status],
    ['Description measure (desktop/tablet)', EXPECTED.descriptionMeasure],
    ['Description measure (mobile)', EXPECTED.descriptionMeasureMobile],
  ];
  for (const [key, expected] of expectations) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked detail fact \`${key}\` is missing`);
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
  if (!row.includes(EXPECTED.detailRoute)) {
    fail(`${EXPECTED.decisionId} does not state the detail route ${EXPECTED.detailRoute}`);
  }
  if (!row.includes(EXPECTED.operation)) {
    fail(`${EXPECTED.decisionId} does not name ${EXPECTED.operation} as the sole S02 operation`);
  }
  if (!row.includes(EXPECTED.mediaRendition)) {
    fail(`${EXPECTED.decisionId} does not restrict media to ${EXPECTED.mediaRendition}`);
  }
  if (!/no price, stock or buying control/i.test(row)) {
    fail(`${EXPECTED.decisionId} does not hide price and stock`);
  }
  if (!/exactly one description section|\*\*exactly one\*\* description section/i.test(row)) {
    fail(`${EXPECTED.decisionId} does not map description to exactly one section`);
  }
  for (const feature of ['related', 'save/favourite', 'commission']) {
    if (!row.toLowerCase().includes(feature)) {
      fail(`${EXPECTED.decisionId} does not record \`${feature}\` as deferred`);
    }
  }
}

function checkApproval(text, fail) {
  if (text === undefined) {
    fail(`${CANONICAL_FILES.approval}: the approval record is missing`);
    return;
  }
  if (!text.includes(EXPECTED.approvalId)) {
    fail(`${CANONICAL_FILES.approval}: does not carry ${EXPECTED.approvalId}`);
  }
  if (!text.includes(EXPECTED.detailRoute)) {
    fail(`${CANONICAL_FILES.approval}: does not state route ${EXPECTED.detailRoute}`);
  }
  if (!text.includes(EXPECTED.operation)) {
    fail(`${CANONICAL_FILES.approval}: does not state contract ${EXPECTED.operation}`);
  }
  if (!text.includes(EXPECTED.mediaRendition)) {
    fail(`${CANONICAL_FILES.approval}: does not state media ${EXPECTED.mediaRendition}`);
  }
  if (!/deferred/i.test(text)) {
    fail(`${CANONICAL_FILES.approval}: does not state that draft sections are outside S02`);
  }
}

/**
 * `APP2-S02-G01-C1`: the readable-measure rule must be stated verbatim in the approval and
 * the phase ruling, and neither may describe the description as full-band.
 */
function checkMeasureRule(sources, block, fail) {
  for (const key of ['approval', 'phase']) {
    const text = key === 'phase' ? (block ?? '') : (sources[key] ?? '');
    // Prose is hard-wrapped, so the rule is compared on collapsed whitespace.
    if (!text.replace(/\s+/g, ' ').includes(MEASURE_RULE)) {
      fail(`${CANONICAL_FILES[key]}: does not state the readable measure rule — "${MEASURE_RULE}"`);
    }
    for (const line of unlabelledMeasureClaims(text)) {
      fail(
        `${CANONICAL_FILES[key]}: describes the description at a rejected full-band width:\n    ${line.trim().slice(0, 200)}`,
      );
    }
  }
}

/**
 * A rejected width presented as the live *description* measure. Two narrowings matter:
 * the line must be about the description/story column — the APP1 shell legitimately
 * discusses a 1280px source band and is none of this rule's business — and historical
 * prose naming what the gate used to render stays legal via the shared label test.
 */
export function unlabelledMeasureClaims(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!REJECTED_MEASURES.some((width) => lower.includes(width))) return false;
    if (!/description|story|câu chuyện|paragraph/.test(lower)) return false;
    if (!/measure|width|column|full[- ]band|full[- ]width/.test(lower)) return false;
    return !isLabelled(line);
  });
}

export function checkStorefrontProductDetailAuthority(root = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const sources = Object.fromEntries(
    Object.keys(CANONICAL_FILES).map((key) => [key, read(root, key)]),
  );

  const block = sources.phase === undefined ? undefined : rulingBlock(sources.phase);
  if (block === undefined) {
    fail(`${CANONICAL_FILES.phase}: no \`${RULING_HEADING.trim()}\` Product Detail ruling block`);
  } else {
    checkFacts(detailFacts(block), fail);
    for (const node of UI03_ROOTS) {
      if (!block.includes(node)) {
        fail(`${CANONICAL_FILES.phase}: the ruling block omits UI03 root ${node}`);
      }
    }
  }

  checkDecisionRow(
    sources.register === undefined ? undefined : decisionRow(sources.register),
    fail,
  );
  checkApproval(sources.approval, fail);
  checkMeasureRule(sources, block, fail);
  if (sources.designIndex !== undefined)
    checkRegistry({
      text: sources.designIndex,
      approvalId: EXPECTED.approvalId,
      route: EXPECTED.detailRoute,
      ui03Roots: UI03_ROOTS,
      designIndex: CANONICAL_FILES.designIndex,
      fail,
    });

  for (const key of ['roadmap', 'traceability', 'designIndex']) {
    if (sources[key] !== undefined && !sources[key].includes(EXPECTED.detailRoute)) {
      fail(`${CANONICAL_FILES[key]}: does not record the detail route ${EXPECTED.detailRoute}`);
    }
  }

  const scanned = [
    ['register', sources.register === undefined ? '' : (decisionRow(sources.register) ?? '')],
    ['phase', block ?? ''],
    ['approval', sources.approval ?? ''],
  ];
  for (const [key, text] of scanned) {
    for (const line of detailAliasPromotions(text)) {
      fail(
        `${CANONICAL_FILES[key]}: promotes a rejected detail path to canonical/approved:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of deferredScopeRequirements(text)) {
      fail(
        `${CANONICAL_FILES[key]}: requires deferred scope the contract cannot feed:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of commerceRequirements(text)) {
      fail(
        `${CANONICAL_FILES[key]}: requires an ecommerce commerce surface:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of storyFieldRequirements(text)) {
      fail(
        `${CANONICAL_FILES[key]}: requires the draft's three story fields instead of one description:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of originalMediaAllowances(text)) {
      fail(
        `${CANONICAL_FILES[key]}: allows a private original or storage-provider URL:\n    ${line.trim().slice(0, 200)}`,
      );
    }
    for (const line of ui03AuthorityClaims(text)) {
      fail(
        `${CANONICAL_FILES[key]}: treats a UI03 draft root as implementation authority:\n    ${line.trim().slice(0, 200)}`,
      );
    }
  }

  // `APP2-S02` may only be called READY while the approval it depends on exists.
  const approvalExists =
    sources.approval !== undefined &&
    sources.designIndex !== undefined &&
    sources.designIndex.includes(EXPECTED.approvalId);
  if (!approvalExists) {
    for (const key of ['roadmap', 'phase', 'traceability']) {
      for (const claim of s02ReadinessClaims(sources[key] ?? '')) {
        fail(
          `${CANONICAL_FILES[key]}: declares APP2-S02 ready without ${EXPECTED.approvalId} — "${claim}"`,
        );
      }
    }
  }

  return failures;
}

function main() {
  const failures = checkStorefrontProductDetailAuthority();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:storefront-product-detail-authority — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:storefront-product-detail-authority — Product Detail is /san-pham/[slug] from publicProductDetail ' +
      'and catalog-preview media across 6 canonical documents; one description section, price/stock hidden, ' +
      'materials/process/related/save/commission deferred, 10 reconciled roots carrying current ' +
      'authority (approved, or superseded by an approved successor on the same route), ' +
      '4 UI03 roots historical',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
