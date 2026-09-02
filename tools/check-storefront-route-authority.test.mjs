/**
 * Regressions for the Storefront route-authority gate (`APP2-S01-G01`).
 *
 * Each case copies the real canonical documents into a scratch tree and then
 * introduces exactly one drift the ruling forbids. A gate that only passes on
 * today's text proves nothing; these prove it would catch the route being moved,
 * an alias being promoted, the category contract drifting, or the staged-card
 * ruling being quietly reversed into a link requirement before S02 exists.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  EXPECTED,
  REPO_ROOT,
  aliasPromotions,
  cardLinkRequirements,
  checkStorefrontRouteAuthority,
  decisionRow,
  isLabelled,
  routeFacts,
  rulingBlock,
  s02ReadinessClaims,
} from './check-storefront-route-authority.mjs';

const scratchRoots = [];

after(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

/** A copy of every canonical file, with `mutate` applied to one of them. */
function fixture(key, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'storefront-route-authority-'));
  scratchRoots.push(root);
  for (const relative of Object.values(CANONICAL_FILES)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target);
  }
  if (key !== undefined) {
    const target = join(root, CANONICAL_FILES[key]);
    writeFileSync(target, mutate(readFileSync(target, 'utf8')));
  }
  return root;
}

function failuresFor(key, mutate) {
  return checkStorefrontRouteAuthority(fixture(key, mutate)).join('\n');
}

const phaseText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');

describe('check-storefront-route-authority', () => {
  it('passes on the committed documents', () => {
    assert.deepEqual(checkStorefrontRouteAuthority(), []);
  });

  it('rejects moving Discover onto the Homepage route', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `APP2-S01 discover route` | `/kham-pha` |',
        '| `APP2-S01 discover route` | `/` |',
      ),
    );
    assert.match(failures, /`APP2-S01 discover route` is "\/", expected "\/kham-pha"/);
  });

  it('rejects moving Discover to /san-pham', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `APP2-S01 discover route` | `/kham-pha` |',
        '| `APP2-S01 discover route` | `/san-pham` |',
      ),
    );
    assert.match(failures, /expected "\/kham-pha"/);
  });

  it('rejects promoting a rejected path to a canonical alias', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '`/`, `/discover`, `/catalog`, `/products`',
        '`/discover` and `/catalog` are approved as canonical Discover aliases; `/products`',
      ),
    );
    assert.match(failures, /promotes a rejected path to canonical\/approved/);
  });

  it('rejects drift in the category query key', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Category query key` | `category` |',
        '| `Category query key` | `danh-muc` |',
      ),
    );
    assert.match(failures, /`Category query key` is "danh-muc", expected "category"/);
  });

  /**
   * The case that stood here — "rejects removing a fixed category slug" —
   * asserted the gate failed when `| \`Category slugs\` | \`thu-bong, khan,
   * quan-ao, khac\` |` lost a value. `APP12-C01-C1` deleted that fact and that
   * assertion, correctly: a governance tool holding the category list is a
   * second category authority, and it would fail the build for a data change.
   * The **test** kept its copy of the four slugs and went red against a fact
   * table that no longer has the row (`APP12-C03`).
   *
   * These two replace it. Together they pin both halves of §24: the gate must
   * hold the *structural* category rule, and must stay silent about which
   * categories exist.
   */
  it('rejects abandoning the database as the category value source of truth', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Category value source of truth` | `DATABASE` |',
        '| `Category value source of truth` | `CONTRACT_ENUM` |',
      ),
    );
    assert.match(
      failures,
      /`Category value source of truth` is "CONTRACT_ENUM", expected "DATABASE"/,
    );
  });

  it('says nothing about which categories exist', () => {
    // A category published, renamed or archived is a row change. No governance
    // document may have to be edited for one, and this asserts the gate cannot
    // become the thing that must be: neither the tool nor its expectations may
    // name a slug value.
    const source = readFileSync(
      join(REPO_ROOT, 'tools/check-storefront-route-authority.mjs'),
      'utf8',
    );
    const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');

    for (const slug of ['thu-bong', 'quan-ao', 'ao-thun']) {
      assert.ok(!code.includes(slug), `the gate names the category value "${slug}"`);
    }
    assert.equal(EXPECTED.categorySlugs, undefined);
  });

  it('rejects requiring an S01 card link before S02 route authority', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**Staged Product cards.** For `APP2-S01`',
        'Every S01 Product card must link to the Product detail route via an href. For `APP2-S01`',
      ),
    );
    assert.match(failures, /requires an S01 card link before S02 route authority/);
  });

  /**
   * Two cases retired here and re-armed in `check-storefront-product-detail-authority`:
   * "declares APP2-S02 ready" and "marks /san-pham/<slug> approved". Both were correct
   * only while the Product Detail route was unresolved. Since IMP-D039 a readiness claim
   * is legitimate *if earned*, and `/san-pham` is the approved detail base — so asserting
   * the old text here would test a superseded ruling, not a live one.
   */
  it('still rejects a second rejected Discover path being promoted', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '`/products`\nand `/san-pham` are **rejected**',
        '`/products` is a canonical alias\nand `/san-pham` are **rejected**',
      ),
    );
    assert.match(failures, /promotes a rejected path to canonical\/approved/);
  });

  it('rejects a card interaction other than NON_INTERACTIVE', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `S01 product card interaction` | `NON_INTERACTIVE` |',
        '| `S01 product card interaction` | `LINKED` |',
      ),
    );
    assert.match(failures, /`S01 product card interaction` is "LINKED"/);
  });

  it('rejects drifting the Product Detail route away from the locked value', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail browser route` | `/san-pham/[slug]` |',
        '| `Product detail browser route` | `/products/[id]` |',
      ),
    );
    assert.match(failures, /`Product detail browser route` is "\/products\/\[id\]"/);
  });

  it('rejects unlocking or removing the decision row', () => {
    const failures = failuresFor('register', (text) =>
      text.replace(`| ${EXPECTED.decisionId} |`, '| IMP-D099 |'),
    );
    assert.match(failures, /no single `IMP-D038` row/);
  });

  it('rejects a decision row that drops the non-interactive authorization', () => {
    const failures = failuresFor('register', (text) =>
      text.replaceAll('non-interactive', 'linked'),
    );
    assert.match(failures, /does not authorize non-interactive S01 product cards/);
  });

  it('rejects dropping the route from a downstream authority', () => {
    const failures = failuresFor('traceability', (text) =>
      text.replaceAll(EXPECTED.discoverRoute, '/somewhere-else'),
    );
    assert.match(failures, /does not record the Discover route \/kham-pha/);
  });

  it('rejects losing the ruling block entirely', () => {
    const failures = failuresFor('phase', (text) => text.replace('### 6.2.2 ', '### 6.2.9x '));
    assert.match(failures, /no `### 6\.2\.2` route-authority block/);
  });
});

describe('route-authority helpers', () => {
  it('bounds the ruling block to its own section', () => {
    const block = rulingBlock(phaseText);
    assert.ok(block.includes('/kham-pha'));
    assert.ok(!block.includes('## 7. Critical end-to-end journey'));
  });

  it('reads every machine-checked fact', () => {
    assert.equal(routeFacts(rulingBlock(phaseText)).size, 7);
  });

  it('finds exactly one decision row', () => {
    const text = readFileSync(join(REPO_ROOT, CANONICAL_FILES.register), 'utf8');
    assert.ok(decisionRow(text)?.startsWith('| IMP-D038 |'));
  });

  it('allows labelled proposal and historical prose', () => {
    assert.ok(isLabelled('`/san-pham/<slug>` as drawn is a proposal only'));
    assert.ok(isLabelled('historical record: the canonical route was once /discover'));
    assert.deepEqual(aliasPromotions('`/san-pham/<slug>` is a proposal, not canonical'), []);
  });

  it('flags an unlabelled alias promotion', () => {
    assert.equal(aliasPromotions('/discover is the canonical Discover route').length, 1);
  });

  it('distinguishes a card-link ban from a card-link requirement', () => {
    assert.deepEqual(cardLinkRequirements('The card must have no href.'), []);
    assert.equal(cardLinkRequirements('The card must carry an href.').length, 1);
  });

  it('matches an S02 readiness claim across a long shared table row', () => {
    assert.equal(
      s02ReadinessClaims('… `APP2-S01` = `READY — NOT STARTED` … `APP2-S02` = `READY` …').length,
      1,
    );
    assert.deepEqual(
      s02ReadinessClaims('`APP2-S01` = `READY — NOT STARTED`; `APP2-S02` = `BLOCKED_BY_UI03`'),
      [],
    );
  });
});
