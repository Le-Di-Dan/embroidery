/**
 * Regressions for the Storefront Product Detail authority gate (`APP2-S02-G01`).
 *
 * Each case copies the real canonical documents into a scratch tree and introduces
 * exactly one drift the ruling forbids. A gate that only passes on today's text proves
 * nothing; these prove it would catch the detail route moving, an alias being approved,
 * the unapproved UI03 draft being promoted back to implementation authority, ecommerce
 * UI or the draft's three story fields being required, a related-Product operation being
 * invented, private originals being allowed, or `APP2-S02` being declared ready before
 * the approval that makes it ready exists.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  EXPECTED,
  RECONCILED_ROOTS,
  REPO_ROOT,
  UI03_ROOTS,
  checkStorefrontProductDetailAuthority,
  commerceRequirements,
  decisionRow,
  deferredScopeRequirements,
  detailAliasPromotions,
  detailFacts,
  originalMediaAllowances,
  rulingBlock,
  storyFieldRequirements,
  ui03AuthorityClaims,
  unlabelledMeasureClaims,
} from './check-storefront-product-detail-authority.mjs';

const scratchRoots = [];

after(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

/** A copy of every canonical file, with `mutate` applied to one of them. */
function fixture(key, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'product-detail-authority-'));
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
  return checkStorefrontProductDetailAuthority(fixture(key, mutate)).join('\n');
}

const phaseText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');

describe('check-storefront-product-detail-authority', () => {
  it('passes on the committed documents', () => {
    assert.deepEqual(checkStorefrontProductDetailAuthority(), []);
  });

  it('rejects moving the detail route', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail route` | `/san-pham/[slug]` |',
        '| `Product detail route` | `/products/[id]` |',
      ),
    );
    assert.match(failures, /`Product detail route` is "\/products\/\[id\]"/);
  });

  it('rejects a Product UUID route in place of the server-owned slug', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail route` | `/san-pham/[slug]` |',
        '| `Product detail route` | `/san-pham/[productId]` |',
      ),
    );
    assert.match(failures, /expected "\/san-pham\/\[slug\]"/);
  });

  it('rejects approving a detail alias', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '`/tac-pham/*` and `/kham-pha/*` are **rejected** as detail aliases — no alias and no',
        '`/tac-pham/*` is an approved canonical detail alias, and so is `/kham-pha/*`.',
      ),
    );
    assert.match(failures, /promotes a rejected detail path to canonical\/approved/);
  });

  it('rejects inventing a second operation for the page', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail operation` | `publicProductDetail` |',
        '| `Product detail operation` | `publicProductDetail, publicRelatedProducts` |',
      ),
    );
    assert.match(
      failures,
      /`Product detail operation` is "publicProductDetail, publicRelatedProducts"/,
    );
  });

  it('rejects inventing a related-Product requirement in prose', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**Continue discovery** replaces the unsupported related feed:',
        'The page must render eight related Product cards from a related feed:',
      ),
    );
    assert.match(failures, /requires deferred scope the contract cannot feed/);
  });

  it('rejects a media rendition other than catalog-preview', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail media rendition` | `catalog-preview` |',
        '| `Product detail media rendition` | `original` |',
      ),
    );
    assert.match(failures, /`Product detail media rendition` is "original"/);
  });

  it('rejects allowing a private original to be rendered', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**Media and lightbox.** Ordered `media[]`',
        'The gallery may render the private original directly. Ordered `media[]`',
      ),
    );
    assert.match(failures, /allows a private original or storage-provider URL/);
  });

  it('rejects splitting the one description into three story fields', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace('| `Description sections` | `1` |', '| `Description sections` | `3` |'),
    );
    assert.match(failures, /`Description sections` is "3"/);
  });

  it('rejects requiring the draft story fields in prose', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**One description.** `description` present',
        'The page must render Cảm hứng, Ý tưởng and Ý nghĩa separately. `description` present',
      ),
    );
    assert.match(failures, /requires the draft's three story fields/);
  });

  it('rejects revealing price or stock', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Price and stock display` | `HIDDEN` |',
        '| `Price and stock display` | `SHOWN` |',
      ),
    );
    assert.match(failures, /`Price and stock display` is "SHOWN"/);
  });

  it('rejects requiring an ecommerce buy-box in prose', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**Studio Work Detail, not a PDP.**',
        'The page must show a price and an add to cart control.',
      ),
    );
    assert.match(failures, /requires an ecommerce commerce surface/);
  });

  it('rejects approving save/favourite or commission scope', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Deferred scope` | `materials, process, related, save, commission` |',
        '| `Deferred scope` | `materials, process` |',
      ),
    );
    assert.match(failures, /`Deferred scope` is "materials, process"/);
  });

  it('rejects reassigning the S01 card link upgrade away from S02', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `S01 card link upgrade owner` | `APP2-S02` |',
        '| `S01 card link upgrade owner` | `APP2-S01` |',
      ),
    );
    assert.match(failures, /`S01 card link upgrade owner` is "APP2-S01"/);
  });

  /**
   * `APP2-S02-G01-C1`. The gate as first delivered claimed a readable story measure while
   * the nodes rendered the description full-band, so the number itself is now checked.
   */
  it('rejects widening the story measure back to the desktop content band', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Description measure (desktop/tablet)` | `640px` |',
        '| `Description measure (desktop/tablet)` | `1280px` |',
      ),
    );
    assert.match(failures, /`Description measure \(desktop\/tablet\)` is "1280px"/);
  });

  it('rejects widening the story measure back to the tablet content band', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Description measure (desktop/tablet)` | `640px` |',
        '| `Description measure (desktop/tablet)` | `928px` |',
      ),
    );
    assert.match(failures, /`Description measure \(desktop\/tablet\)` is "928px"/);
  });

  it('rejects widening the mobile description beyond its content gutter', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Description measure (mobile)` | `342px content width` |',
        '| `Description measure (mobile)` | `390px full bleed` |',
      ),
    );
    assert.match(failures, /`Description measure \(mobile\)` is "390px full bleed"/);
  });

  it('rejects losing the readable-measure rule from the approval', () => {
    const failures = failuresFor('approval', (text) =>
      text.replace(
        'maximum readable measure of 640px on Desktop and Tablet; Mobile uses its 342px content\nwidth',
        'whatever width the content band allows',
      ),
    );
    assert.match(failures, /does not state the readable measure rule/);
  });

  it('rejects describing the story column as full-band in the ruling', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**Readable measure (`APP2-S02-G01-C1`).** Product description uses a maximum readable',
        'The description column spans the full 1280px content-band width. Product description uses a maximum readable',
      ),
    );
    assert.match(failures, /describes the description at a rejected full-band width/);
  });

  it('rejects unlocking or removing the decision row', () => {
    const failures = failuresFor('register', (text) =>
      text.replace(`| ${EXPECTED.decisionId} |`, '| IMP-D099 |'),
    );
    assert.match(failures, /no single `IMP-D039` row/);
  });

  it('rejects a decision row that stops hiding price and stock', () => {
    const failures = failuresFor('register', (text) =>
      text.replace('no price, stock or buying control is displayed', 'the price is displayed'),
    );
    assert.match(failures, /does not hide price and stock/);
  });

  it('rejects losing the approval record', () => {
    const failures = failuresFor('approval', () => '# emptied\n');
    assert.match(failures, /does not carry FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001/);
  });

  it('rejects a reconciled root that is not approved for implementation', () => {
    const failures = failuresFor('designIndex', (text) =>
      text.replace(
        '| FIG-S02-PRODUCT-DETAIL-DESKTOP | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION',
        '| FIG-S02-PRODUCT-DETAIL-DESKTOP | Storefront | /san-pham/[slug] | Product Detail (Reconciled) | Default | Desktop 1440 | high-fidelity | DRAFT',
      ),
    );
    assert.match(
      failures,
      /529:2225 has no approved registry row|is not APPROVED_FOR_IMPLEMENTATION/,
    );
  });

  it('rejects deleting a UI03 draft root from the registry', () => {
    const failures = failuresFor('designIndex', (text) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('| FIG-UI03-WORK-DETAIL-DESKTOP |'))
        .join('\n'),
    );
    assert.match(failures, /UI03 draft root 262:1291 is no longer recorded/);
  });

  it('rejects promoting a UI03 draft root back to implementation authority', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        'Design authority.** The reconciled section `529:2224`',
        'Design authority.** UI03 `262:1291` is the implementation authority; the section `529:2224`',
      ),
    );
    assert.match(failures, /treats a UI03 draft root as implementation authority/);
  });

  it('rejects declaring APP2-S02 ready when the approval does not exist', () => {
    const failures = failuresFor('designIndex', (text) =>
      text.replaceAll(EXPECTED.approvalId, 'FIG-APPROVAL-DOES-NOT-EXIST-001'),
    );
    assert.match(
      failures,
      /declares APP2-S02 ready without FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001/,
    );
  });

  it('rejects dropping the detail route from a downstream authority', () => {
    const failures = failuresFor('traceability', (text) =>
      text.replaceAll(EXPECTED.detailRoute, '/somewhere-else'),
    );
    assert.match(failures, /does not record the detail route \/san-pham\/\[slug\]/);
  });

  it('rejects losing the ruling block entirely', () => {
    const failures = failuresFor('phase', (text) => text.replace('### 6.2.3 ', '### 6.2.9x '));
    assert.match(failures, /no `### 6\.2\.3` Product Detail ruling block/);
  });
});

describe('product-detail authority helpers', () => {
  it('bounds the ruling block to its own section', () => {
    const block = rulingBlock(phaseText);
    assert.ok(block.includes('/san-pham/[slug]'));
    assert.ok(!block.includes('## 7. Critical end-to-end journey'));
  });

  it('reads every machine-checked fact', () => {
    assert.equal(detailFacts(rulingBlock(phaseText)).size, 11);
  });

  it('finds exactly one decision row', () => {
    const text = readFileSync(join(REPO_ROOT, CANONICAL_FILES.register), 'utf8');
    assert.ok(decisionRow(text)?.startsWith('| IMP-D039 |'));
  });

  it('keeps explicit historical and deferred prose legal', () => {
    assert.deepEqual(
      deferredScopeRequirements(
        'Related works must not be rendered; the operation does not exist.',
      ),
      [],
    );
    assert.deepEqual(
      commerceRequirements('The page must never show a price, even though B04 returns one.'),
      [],
    );
    assert.deepEqual(
      storyFieldRequirements('Cảm hứng / Ý tưởng / Ý nghĩa must never be split out again.'),
      [],
    );
    assert.deepEqual(
      originalMediaAllowances('A private original is never rendered by the Storefront.'),
      [],
    );
    assert.deepEqual(
      detailAliasPromotions('`/tac-pham/*` is not an approved alias — it is rejected.'),
      [],
    );
    assert.deepEqual(
      ui03AuthorityClaims('UI03 `261:1290` is historical and is not implementation authority.'),
      [],
    );
    assert.deepEqual(
      unlabelledMeasureClaims('The description was historically 1280px wide; it no longer is.'),
      [],
    );
    // The APP1 shell legitimately discusses a 1280px source band; that is not this rule.
    assert.deepEqual(
      unlabelledMeasureClaims('The APP1 shell max width stays 1200px although frames draw 1280px.'),
      [],
    );
  });

  it('flags the same sentences without their labels', () => {
    assert.equal(unlabelledMeasureClaims('The description column measure is 1280px.').length, 1);
    assert.equal(deferredScopeRequirements('Related works must be rendered.').length, 1);
    assert.equal(commerceRequirements('The page must show a price.').length, 1);
    assert.equal(storyFieldRequirements('Ý nghĩa must be its own field.').length, 1);
    assert.equal(originalMediaAllowances('Render the private original at full size.').length, 1);
    assert.equal(detailAliasPromotions('`/tac-pham/x` is an approved alias.').length, 1);
    assert.equal(
      ui03AuthorityClaims('UI03 `279:1504` is the implementation authority for S02.').length,
      1,
    );
  });

  it('covers every reconciled root and UI03 root', () => {
    assert.equal(RECONCILED_ROOTS.length, 10);
    assert.equal(UI03_ROOTS.length, 4);
  });
});
