/**
 * Regressions for the `APP3-G02` lifecycle-authority gate (IMP-D042).
 *
 * Every case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked authority.
 *
 * The cases worth reading twice are the ones that encode *why this gate exists*:
 * `publish fused with version creation` and `archive conflated with unpublish`
 * are the two regressions the delivered repository and LC-04 respectively
 * already exhibited before IMP-D042.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  DECISION_ID,
  EXPECTED_DEPENDENCIES,
  EXPECTED_FACTS,
  REPO_ROOT,
  boundedTable,
  checkApp3G02,
  sectionBody,
  tableRows,
} from './check-app3-g02.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';

const phaseText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');
const specText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.spec), 'utf8');
const registerText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.register), 'utf8');

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying every canonical file both gates read. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app3-g02-'));
  temporaries.push(dir);
  for (const relative of [...Object.values(CANONICAL_FILES), ...Object.values(G01_FILES)]) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
  // The G01 chronology half reads real git history.
  cpSync(join(REPO_ROOT, '.git'), join(dir, '.git'), { recursive: true });
  for (const [relative, text] of Object.entries(edits)) {
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** Failures after one substitution in a named canonical file. */
function failuresAfter(key, from, to) {
  const source = { phase: phaseText, spec: specText, register: registerText }[key];
  assert.ok(source.includes(from), `${key} is missing the anchor: ${from.slice(0, 70)}`);
  return checkApp3G02(rootWith({ [CANONICAL_FILES[key]]: source.replace(from, to) }));
}

describe('APP3-G02 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp3G02(REPO_ROOT), []);
  });

  it('records every ruled fact and dependency row', () => {
    const facts = boundedTable(phaseText, '### 6.5.1 ', '### 6.5.2 ');
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, `fact ${key}`);
    }
    const rows = tableRows(sectionBody(phaseText, '### 6.5.4 '));
    for (const [id, status] of Object.entries(EXPECTED_DEPENDENCIES)) {
      assert.equal(rows.get(id), status, `dependency ${id}`);
    }
  });
});

/**
 * `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01`.
 *
 * The defect was invisible while §6.5.4 was the last subsection before §7: both
 * bounds produced the same block. It becomes a wrong *answer* only once a later
 * gate adds its own dependency table, which is why these cases assert the two
 * forms diverge rather than merely that the current repository passes.
 */
describe('APP3-G02 — §6.5.4 is bounded at its own end', () => {
  const own = sectionBody(phaseText, '### 6.5.4 ');

  it('reads only its own table, not the later G03 one', () => {
    assert.ok(own.includes('`APP3-G02` | `COMPLETE — REVIEW_DELIVERED`'));
    assert.ok(!own.includes('### 6.6'), 'the block must stop before §6.6');
    assert.ok(!own.includes('UNBLOCKED_BY_G03'), 'a G03-only status leaked into the G02 block');
  });

  it('stops at the next heading of equal or higher level', () => {
    const table = ['## 5 ', '### 5.1 ', '| `A` | `own` |', '### 5.2 ', '| `A` | `later` |'].join(
      '\n',
    );
    assert.equal(tableRows(sectionBody(table, '### 5.1 ')).get('A'), 'own');
    const higher = ['### 5.1 ', '| `A` | `own` |', '## 6 ', '| `A` | `later` |'].join('\n');
    assert.equal(tableRows(sectionBody(higher, '### 5.1 ')).get('A'), 'own');
    // A deeper heading is part of the section, not a boundary.
    const deeper = ['### 5.1 ', '#### 5.1.1 ', '| `A` | `own` |'].join('\n');
    assert.equal(tableRows(sectionBody(deeper, '### 5.1 ')).get('A'), 'own');
  });

  it('cannot be overwritten by a duplicate key in a later section', () => {
    // The real shape, small enough to read: G02's table, then two later gates
    // with rows carrying the same ids, then §7.
    const doc = [
      '### 6.5.4 Dependency reconciliation',
      '| `APP3-G01` | `COMPLETE — REVIEW_ACCEPTED` |',
      '## 6.6 A later gate',
      '### 6.6.4 Dependency reconciliation',
      '| `APP3-G01` | `OVERWRITTEN_BY_G03` |',
      '## 6.7 A later gate still',
      '### 6.7.4 Dependency reconciliation',
      '| `APP3-G01` | `OVERWRITTEN_BY_G04` |',
      '## 7. Critical end-to-end journey',
    ].join('\n');

    assert.equal(
      tableRows(sectionBody(doc, '### 6.5.4 ')).get('APP3-G01'),
      'COMPLETE — REVIEW_ACCEPTED',
    );
    // The retired literal bound is exactly what let the last duplicate win.
    assert.equal(boundedTable(doc, '### 6.5.4 ', '## 7. ').get('APP3-G01'), 'OVERWRITTEN_BY_G04');
  });

  it('does not depend on a `## 7. ` mention that happens to precede §7', () => {
    // The live plan currently mentions the literal marker in prose *before* §7,
    // so the retired bound was being ended by a sentence about itself. The
    // repaired bound must not move when that sentence does.
    const moved = phaseText.replace('`## 7. `', '`the next heading`');
    assert.notEqual(moved, phaseText, 'the prose anchor moved');
    assert.deepEqual(
      [...tableRows(sectionBody(moved, '### 6.5.4 ')).entries()],
      [...tableRows(sectionBody(phaseText, '### 6.5.4 ')).entries()],
    );
  });

  it('still refuses a real regression inside §6.5.4', () => {
    const failures = failuresAfter(
      'phase',
      '| `APP3-G01` | `COMPLETE — REVIEW_ACCEPTED` |\n| `APP3-G02` | `COMPLETE — REVIEW_DELIVERED` |',
      '| `APP3-G01` | `NOT STARTED` |\n| `APP3-G02` | `COMPLETE — REVIEW_DELIVERED` |',
    );
    assert.ok(mentions(failures, '`APP3-G01` is "NOT STARTED"'));
  });
});

describe('APP3-G02 — the Template lifecycle is weakened', () => {
  it('rejects a missing Template transition', () => {
    const row = specText.split('\n').find((line) => line.startsWith('| TR-LC24-06 |'));
    assert.ok(row);
    const failures = failuresAfter('spec', `${row}\n`, '');
    assert.ok(mentions(failures, 'LC-24 is missing TR-LC24-06'));
  });

  it('rejects a direct ARCHIVED → PUBLISHED transition', () => {
    const row = specText.split('\n').find((line) => line.startsWith('| TR-LC24-06 |'));
    const failures = failuresAfter(
      'spec',
      row,
      '| TR-LC24-06 | ARCHIVED→PUBLISHED | admin | — | header | yes | yes R | token |',
    );
    assert.ok(mentions(failures, 'direct ARCHIVED → PUBLISHED'));
  });

  it('rejects DRAFT no longer being the only editable state', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template editable state` | `DRAFT` |',
      '| `Template editable state` | `DRAFT PUBLISHED` |',
    );
    assert.ok(mentions(failures, '`Template editable state` is "DRAFT PUBLISHED"'));
  });

  it('rejects a Template hard-delete transition', () => {
    const row = specText.split('\n').find((line) => line.startsWith('| TR-LC24-06 |'));
    const failures = failuresAfter(
      'spec',
      row,
      `${row}\n| TR-LC24-07 | ARCHIVED→(hard delete) | admin | — | row | yes | yes | token |`,
    );
    assert.ok(mentions(failures, 'delete transition'));
  });

  it('rejects declaring a hard delete in the fact table', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template hard delete in APP3` | `NONE` |',
      '| `Template hard delete in APP3` | `ALLOWED` |',
    );
    assert.ok(mentions(failures, '`Template hard delete in APP3` is "ALLOWED"'));
  });

  it('rejects publish fused with version creation', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template draft save behaviour` | `NEW_MONOTONIC_VERSION` |',
      '| `Template draft save behaviour` | `PUBLISH_ON_SAVE` |',
    );
    assert.ok(mentions(failures, '`Template draft save behaviour` is "PUBLISH_ON_SAVE"'));
  });

  it('rejects mutable versions', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template version mutability` | `IMMUTABLE_FROM_CREATION` |',
      '| `Template version mutability` | `MUTABLE_WHILE_DRAFT` |',
    );
    assert.ok(mentions(failures, '`Template version mutability` is "MUTABLE_WHILE_DRAFT"'));
  });

  it('rejects unpublish clearing published_at', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template published_at write` | `SET_ONCE_NEVER_CLEARED` |',
      '| `Template published_at write` | `CLEARED_ON_UNPUBLISH` |',
    );
    assert.ok(mentions(failures, '`Template published_at write` is "CLEARED_ON_UNPUBLISH"'));
  });

  it('rejects public read choosing an unpublished version', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template public read selection` | `HIGHEST_PUBLISHED_VERSION` |',
      '| `Template public read selection` | `HIGHEST_VERSION` |',
    );
    assert.ok(mentions(failures, '`Template public read selection` is "HIGHEST_VERSION"'));
  });

  it('rejects a clone that stays a live Template reference', () => {
    const failures = failuresAfter(
      'phase',
      '| `Template clone result` | `INDEPENDENT_DOCUMENT_LINEAGE_ONLY` |',
      '| `Template clone result` | `LIVE_TEMPLATE_REFERENCE` |',
    );
    assert.ok(mentions(failures, '`Template clone result` is "LIVE_TEMPLATE_REFERENCE"'));
  });

  it('rejects wildcard or many-to-many publication compatibility', () => {
    const failures = failuresAfter(
      'phase',
      '| `APP3 template compatibility` | `EXACT_PRODUCT_SIDE_AREA` |',
      '| `APP3 template compatibility` | `PRODUCT_WIDE_WILDCARD` |',
    );
    assert.ok(mentions(failures, '`APP3 template compatibility` is "PRODUCT_WIDE_WILDCARD"'));

    const m2m = failuresAfter(
      'phase',
      '| `APP3 template many to many` | `NOT_AUTHORIZED` |',
      '| `APP3 template many to many` | `AUTHORIZED` |',
    );
    assert.ok(mentions(m2m, '`APP3 template many to many` is "AUTHORIZED"'));
  });

  it('rejects G02 claiming it requires a migration', () => {
    const failures = failuresAfter(
      'phase',
      '| `G02_DB_CONTRIBUTION` | `NONE` |',
      '| `G02_DB_CONTRIBUTION` | `REQUIRES_APP3_DB01` |',
    );
    assert.ok(mentions(failures, '`G02_DB_CONTRIBUTION` is "REQUIRES_APP3_DB01"'));
  });
});

describe('APP3-G02 — the Product archive reconciliation is undone', () => {
  it('rejects removing DRAFT → ARCHIVED from LC-04', () => {
    const row = specText.split('\n').find((line) => line.startsWith('| TR-LC04-06 |'));
    assert.ok(row);
    const failures = failuresAfter('spec', `${row}\n`, '');
    assert.ok(mentions(failures, 'DRAFT → ARCHIVED'));
    // The delivered code still archives from DRAFT, so the follow-up re-opens.
    assert.ok(mentions(failures, 'FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01'));
  });

  it('rejects archive conflated with unpublish', () => {
    const row = specText.split('\n').find((line) => line.startsWith('| TR-LC04-06 |'));
    const failures = failuresAfter(
      'spec',
      row,
      '| TR-LC04-06 | PUBLISHED→DRAFT | admin | conflated with unpublish | — | yes |',
    );
    assert.ok(mentions(failures, 'PUBLISHED → DRAFT (unpublish) transitions, expected 1'));
  });

  it('rejects removing the existing PUBLISHED → ARCHIVED archive', () => {
    const row = specText.split('\n').find((line) => line.startsWith('| TR-LC04-02 |'));
    const failures = failuresAfter('spec', `${row}\n`, '');
    assert.ok(mentions(failures, 'PUBLISHED → ARCHIVED'));
  });

  it('rejects LC-04 transition-count drift', () => {
    const failures = failuresAfter(
      'phase',
      '| `Product transition count` | `6` |',
      '| `Product transition count` | `5` |',
    );
    assert.ok(mentions(failures, '`Product transition count` is "5"'));
  });

  it('rejects the archive follow-up left open', () => {
    const failures = failuresAfter(
      'phase',
      '| `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` | `COMPLETE — CLOSED_BY_APP3-G02` |',
      '| `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` | `OPEN` |',
    );
    assert.ok(mentions(failures, 'FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01'));
  });

  it('rejects falsely closing the deferred archive-UI follow-up', () => {
    const failures = failuresAfter(
      'phase',
      '| `FU-APP2-PRODUCT-ARCHIVE-UI-01` | `DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION` |',
      '| `FU-APP2-PRODUCT-ARCHIVE-UI-01` | `COMPLETE — CLOSED_BY_APP3-G02` |',
    );
    assert.ok(mentions(failures, 'FU-APP2-PRODUCT-ARCHIVE-UI-01'));
  });
});

describe('APP3-G02 — authority and repository facts move', () => {
  it('rejects a missing decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', `${row}\n`, '');
    assert.ok(mentions(failures, `${DECISION_ID} appears 0 times`));
  });

  it('rejects a duplicated decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, `${row}\n${row}`);
    assert.ok(mentions(failures, `${DECISION_ID} appears 2 times`));
  });

  it('rejects a decision missing one of the eight rulings', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, row.replaceAll('PO-08', 'PO-99'));
    assert.ok(mentions(failures, 'does not record ruling PO-08'));
  });

  it('rejects a Template operation appearing in OpenAPI', () => {
    const openapi = JSON.parse(readFileSync(join(REPO_ROOT, CANONICAL_FILES.openapi), 'utf8'));
    openapi.paths['/api/admin/design-templates'] = { post: { operationId: 'smuggled' } };
    const failures = checkApp3G02(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(openapi) }));
    assert.ok(mentions(failures, 'Template operation'));
  });

  it('rejects published_at becoming NOT NULL', () => {
    const versions = readFileSync(join(REPO_ROOT, CANONICAL_FILES.versionSchema), 'utf8');
    const failures = checkApp3G02(
      rootWith({
        [CANONICAL_FILES.versionSchema]: versions.replace(
          "publishedAt: instant('published_at')",
          "publishedAt: instant('published_at').notNull()",
        ),
      }),
    );
    assert.ok(mentions(failures, 'published_at became NOT NULL'));
  });

  it('propagates an APP3-G01 regression', () => {
    const g01Phase = readFileSync(join(REPO_ROOT, G01_FILES.phase), 'utf8');
    const failures = checkApp3G02(
      rootWith({
        [G01_FILES.phase]: g01Phase.replace(
          '| `G01_DB_DISPOSITION` | `REQUIRES_APP3_DB01` |',
          '| `G01_DB_DISPOSITION` | `NOT_REQUIRED` |',
        ),
      }),
    );
    assert.ok(mentions(failures, 'APP3-G01 regression'));
  });
});
