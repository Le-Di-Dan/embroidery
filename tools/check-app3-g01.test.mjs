/**
 * Regressions for the `APP3-G01` placement-authority gate (IMP-D041).
 *
 * A gate that only ever says yes is indistinguishable from no gate, so every
 * case below breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked authority.
 *
 * Two cases deserve their names read carefully. `keeps the checker honest about
 * absence` proves the gate fails when an APP3 placement operation *appears* —
 * the only way to catch implementation smuggled in behind a gate. And `a wrapped
 * denial is not a claim` pins the sentence-level reading: markdown hard-wraps,
 * and a line-level check invents violations the author never wrote.
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
  checkApp3G01,
  dependencyTable,
  factTable,
  plain,
  schemaColumns,
  sentences,
} from './check-app3-g01.mjs';

const phaseText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');
const registerText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.register), 'utf8');

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real canonical files plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app3-g01-'));
  temporaries.push(dir);
  for (const relative of Object.values(CANONICAL_FILES)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
  // The chronology half reads real git history, which only exists at the repo.
  cpSync(join(REPO_ROOT, '.git'), join(dir, '.git'), { recursive: true });
  for (const [relative, text] of Object.entries(edits)) {
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

/** Failures after one substitution in the APP3 phase plan. */
function failuresAfterPhaseEdit(from, to) {
  assert.ok(phaseText.includes(from), `phase plan is missing the anchor: ${from.slice(0, 70)}`);
  return checkApp3G01(rootWith({ [CANONICAL_FILES.phase]: phaseText.replace(from, to) }));
}

const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

describe('APP3-G01 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp3G01(REPO_ROOT), []);
  });

  it('records all twenty ruled facts and eight dependency rows', () => {
    const facts = factTable(phaseText);
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, `fact ${key}`);
    }
    const rows = dependencyTable(phaseText);
    for (const [id, status] of Object.entries(EXPECTED_DEPENDENCIES)) {
      assert.equal(rows.get(id), status, `dependency ${id}`);
    }
  });

  it('reads a wrapped denial as a denial, not a claim', () => {
    const wrapped =
      'the association stays on background_asset_id rather\nthan a new `product_media.role`.';
    const [only] = sentences(wrapped);
    assert.ok(only.includes('rather than'), 'newline should be flattened into the sentence');
    assert.ok(plain('Side backgrounds are **not** duplicated.').includes('not '));
  });

  it('parses real Drizzle column names', () => {
    const columns = schemaColumns(
      readFileSync(join(REPO_ROOT, CANONICAL_FILES.productSides), 'utf8'),
    );
    assert.ok(columns.has('background_asset_id'));
    assert.ok(columns.has('px_per_mm'));
  });
});

describe('APP3-G01 — a ruling is dropped or altered', () => {
  it('rejects a decision row missing one of the seven rulings', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    assert.ok(row);
    const failures = checkApp3G01(
      rootWith({
        [CANONICAL_FILES.register]: registerText.replace(row, row.replaceAll('PO-07', 'PO-99')),
      }),
    );
    assert.ok(mentions(failures, 'does not record ruling PO-07'));
  });

  it('rejects a missing decision id', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = checkApp3G01(
      rootWith({ [CANONICAL_FILES.register]: registerText.replace(`${row}\n`, '') }),
    );
    assert.ok(mentions(failures, `${DECISION_ID} is missing`));
  });

  it('rejects a duplicated decision id', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = checkApp3G01(
      rootWith({ [CANONICAL_FILES.register]: registerText.replace(row, `${row}\n${row}`) }),
    );
    assert.ok(mentions(failures, 'is declared 2 times'));
  });

  it('rejects a wrong canonical Studio route', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Canonical Studio route` | `/san-pham/[slug]/thiet-ke` |',
      '| `Canonical Studio route` | `/studio/[slug]` |',
    );
    assert.ok(mentions(failures, '`Canonical Studio route` is "/studio/[slug]"'));
  });

  it('rejects a Studio route that no longer extends the Product detail route', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Studio route base` | `/san-pham/[slug]` |',
      '| `Studio route base` | `/kham-pha` |',
    );
    assert.ok(mentions(failures, 'does not extend the detail route'));
  });

  it('rejects making global publication depend on placement', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Publication requires placement` | `NO` |',
      '| `Publication requires placement` | `YES` |',
    );
    assert.ok(mentions(failures, '`Publication requires placement` is "YES"'));
  });

  it('rejects dropping the Studio-eligibility requirement', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Studio eligibility requires placement` | `YES` |',
      '| `Studio eligibility requires placement` | `NO` |',
    );
    assert.ok(mentions(failures, '`Studio eligibility requires placement` is "NO"'));
  });

  it('rejects product_media becoming the canonical side-background association', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Side background association` | `product_sides.background_asset_id` |',
      '| `Side background association` | `product_media.role SIDE_BACKGROUND` |',
    );
    assert.ok(mentions(failures, '`Side background association` is'));
  });

  it('rejects prose promoting product_media to side-background authority', () => {
    const failures = failuresAfterPhaseEdit(
      'Side backgrounds are **not** duplicated\ninto `product_media`.',
      'Side backgrounds are the canonical background rows duplicated into `product_media`.',
    );
    assert.ok(mentions(failures, 'promotes product_media to side-background authority'));
  });

  it('rejects G01 selecting a derivative kind that APP3-G04 owns', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Side background derivative kind owner` | `APP3-G04` |',
      '| `Side background derivative kind owner` | `CATALOG_PREVIEW` |',
    );
    assert.ok(mentions(failures, '`Side background derivative kind owner` is "CATALOG_PREVIEW"'));
  });

  it('rejects incomplete customer selection rules', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Customer area selection` | `AUTO_WHEN_SINGLE_ELSE_CUSTOMER` |',
      '| `Customer area selection` | `ALWAYS_AUTO` |',
    );
    assert.ok(mentions(failures, '`Customer area selection` is "ALWAYS_AUTO"'));
  });

  it('rejects leaving referenced placement mutable', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Referenced placement mutability` | `IMMUTABLE_AFTER_FIRST_REFERENCE` |',
      '| `Referenced placement mutability` | `ALWAYS_MUTABLE` |',
    );
    assert.ok(mentions(failures, '`Referenced placement mutability` is "ALWAYS_MUTABLE"'));
  });

  it('rejects allowing a hard delete of referenced placement', () => {
    const failures = failuresAfterPhaseEdit(
      '| `Referenced placement deletion` | `NO_HARD_DELETE` |',
      '| `Referenced placement deletion` | `HARD_DELETE_ALLOWED` |',
    );
    assert.ok(mentions(failures, '`Referenced placement deletion` is "HARD_DELETE_ALLOWED"'));
  });

  it('rejects a DB disposition that no longer requires APP3-DB01', () => {
    const failures = failuresAfterPhaseEdit(
      '| `G01_DB_DISPOSITION` | `REQUIRES_APP3_DB01` |',
      '| `G01_DB_DISPOSITION` | `NOT_REQUIRED` |',
    );
    assert.ok(mentions(failures, '`G01_DB_DISPOSITION` is "NOT_REQUIRED"'));
  });

  it('rejects an overclaimed downstream dependency', () => {
    const failures = failuresAfterPhaseEdit(
      '| `APP3-B02` | `BLOCKED_BY_APP3_G04` |',
      '| `APP3-B02` | `READY — NOT STARTED` |',
    );
    assert.ok(mentions(failures, '`APP3-B02` is "READY — NOT STARTED"'));
  });

  it('rejects a phase plan with the ruling table removed', () => {
    const start = phaseText.indexOf('### 6.4.1 ');
    const end = phaseText.indexOf('### 6.4.2 ');
    const failures = checkApp3G01(
      rootWith({ [CANONICAL_FILES.phase]: phaseText.slice(0, start) + phaseText.slice(end) }),
    );
    assert.ok(failures.length >= Object.keys(EXPECTED_FACTS).length);
    assert.ok(mentions(failures, 'is missing'));
  });
});

describe('APP3-G01 — repository facts move underneath the ruling', () => {
  it('rejects a placement column the ruling relies on being removed', () => {
    const sides = readFileSync(join(REPO_ROOT, CANONICAL_FILES.productSides), 'utf8');
    const failures = checkApp3G01(
      rootWith({
        [CANONICAL_FILES.productSides]: sides.replaceAll("'px_per_mm'", "'px_per_millimetre'"),
      }),
    );
    assert.ok(mentions(failures, 'required placement column `px_per_mm` is gone'));
  });

  /**
   * The gate accepts exactly two consistent worlds and refuses every mixture.
   *
   * `APP3-G01` ruled that the placement API may exist and `APP3-B01` built it,
   * so an absence check that could never be satisfied again would be deleted
   * rather than maintained. These three cases are what keeps it meaningful.
   */
  it('refuses a placement operation while APP3-B01 is not recorded complete', () => {
    const phase = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');
    const failures = checkApp3G01(
      rootWith({
        [CANONICAL_FILES.phase]: phase.replaceAll(
          'APP3-B01 = COMPLETE',
          'APP3-B01 = READY — NOT STARTED',
        ),
      }),
    );
    assert.ok(mentions(failures, 'no APP3 backend checkpoint has run'), failures.join('\n'));
  });

  it('refuses a placement operation the ruling never authorised', () => {
    const openapi = JSON.parse(readFileSync(join(REPO_ROOT, CANONICAL_FILES.openapi), 'utf8'));
    openapi.paths['/api/public/products/{slug}/sides/{sideCode}/areas'] = {
      get: { operationId: 'smuggled' },
    };
    const failures = checkApp3G01(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(openapi) }));
    assert.ok(mentions(failures, 'is not an APP3-B01 placement operation'), failures.join('\n'));
  });

  it('refuses the APP3-B02 delivery path while B02 has not delivered', () => {
    // The mode-aware half. The path is legitimate *only* in the world where the
    // phase records its owner as complete; with that token gone the same
    // operation is an unauthorised placement surface again.
    const phase = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');
    const failures = checkApp3G01(
      rootWith({
        [CANONICAL_FILES.phase]: phase.replaceAll(/APP3-B02 = COMPLETE[^\n]*/g, 'APP3-B02 = READY'),
      }),
    );
    assert.ok(mentions(failures, 'is not an APP3-B01 placement operation'), failures.join('\n'));
  });

  it('refuses a delivered checkpoint whose operation went missing', () => {
    const openapi = JSON.parse(readFileSync(join(REPO_ROOT, CANONICAL_FILES.openapi), 'utf8'));
    delete openapi.paths['/api/public/products/{slug}/placement'];
    const failures = checkApp3G01(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(openapi) }));
    assert.ok(mentions(failures, 'is recorded complete but'), failures.join('\n'));
  });

  it('rejects a SIDE_BACKGROUND product-media role appearing in the schema', () => {
    const media = readFileSync(join(REPO_ROOT, CANONICAL_FILES.productMedia), 'utf8');
    const failures = checkApp3G01(
      rootWith({
        [CANONICAL_FILES.productMedia]: media.replace("'DETAIL'", "'DETAIL', 'SIDE_BACKGROUND'"),
      }),
    );
    assert.ok(mentions(failures, 'a SIDE_BACKGROUND role exists'));
  });

  it('rejects losing the accepted Product detail route from APP2 authority', () => {
    const app2 = readFileSync(join(REPO_ROOT, CANONICAL_FILES.app2Phase), 'utf8');
    const failures = checkApp3G01(
      rootWith({
        [CANONICAL_FILES.app2Phase]: app2.replaceAll('/san-pham/[slug]', '/works/[slug]'),
      }),
    );
    assert.ok(mentions(failures, 'is no longer recorded'));
  });

  it('propagates an APP2 closure chronology failure', () => {
    const dir = rootWith();
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    const failures = checkApp3G01(dir);
    assert.ok(mentions(failures, 'APP2 closure chronology'));
  });
});
