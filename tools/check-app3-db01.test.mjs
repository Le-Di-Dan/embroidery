/**
 * Regressions for the `APP3-DB01` migration gate.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. Nothing here writes into tracked
 * authority, and nothing here talks to PostgreSQL — behaviour against a real
 * database is the integration suites' job
 * (`app3-placement-authority`, `app3-derivative-metadata`, `app3-placement-upgrade`).
 *
 * What this gate is really guarding is the seam between a recorded schema
 * decision and the schema itself, so the cases worth reading twice are the ones
 * that desynchronise the two: a migration whose backfill runs after `SET NOT
 * NULL`, a trigger deleted while the prose still describes it, a column made
 * `NOT NULL` that historical rows cannot satisfy.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  EXPECTED_DEPENDENCIES,
  EXPECTED_FACTS,
  METADATA_COLUMNS,
  MIGRATION_TAG,
  REPO_ROOT,
  checkApp3Db01,
  dependencyTable,
} from './check-app3-db01.mjs';
import { PROTECTED_COLUMNS } from './check-app3-db01-placement.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES, sectionBody, tableRows } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const phaseText = read(CANONICAL_FILES.phase);
const migrationText = read(CANONICAL_FILES.migration);
const derivativesText = read(CANONICAL_FILES.derivatives);
const sidesText = read(CANONICAL_FILES.productSides);

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const CANONICAL = new Set([
  ...Object.values(CANONICAL_FILES),
  ...Object.values(G01_FILES),
  ...Object.values(G02_FILES),
  ...Object.values(G03_FILES),
  ...Object.values(G04_FILES),
]);

/**
 * One throwaway root, built once and restored between cases.
 *
 * A fresh root per case would copy the whole `.git` directory forty times,
 * because the G01 chronology half reads real history. `node:test` runs subtests
 * sequentially, so writing an edit and putting the original back is safe.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-db01-'));
  temporaries.push(base);
  for (const relative of CANONICAL) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  // The migration folder is read as a directory listing, not one file.
  cpSync(
    join(REPO_ROOT, 'packages/database/migrations'),
    join(base, 'packages/database/migrations'),
    {
      recursive: true,
    },
  );
  cpSync(
    join(REPO_ROOT, 'apps/api/src/modules/design'),
    join(base, 'apps/api/src/modules/design'),
    {
      recursive: true,
    },
  );
  cpSync(join(REPO_ROOT, '.git'), join(base, '.git'), { recursive: true });
  return base;
}

/** Runs the gate against the shared root with `edits` applied, then restores. */
function run(edits = {}) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, text] of Object.entries(edits)) {
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  try {
    return checkApp3Db01(dir);
  } finally {
    for (const relative of touched) cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
}

const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

const SOURCES = {
  phase: () => phaseText,
  migration: () => migrationText,
  derivatives: () => derivativesText,
  productSides: () => sidesText,
};

function failuresAfter(key, from, to) {
  const source = SOURCES[key]();
  assert.ok(source.includes(from), `${key} is missing the anchor: ${from.slice(0, 70)}`);
  return run({ [CANONICAL_FILES[key]]: source.replaceAll(from, to) });
}

function factChanged(key, replacement) {
  const from = `| \`${key}\` | \`${EXPECTED_FACTS[key]}\` |`;
  return failuresAfter('phase', from, `| \`${key}\` | \`${replacement}\` |`);
}

describe('APP3-DB01 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp3Db01(REPO_ROOT), []);
  });

  it('records every migration fact and dependency row', () => {
    const facts = tableRows(sectionBody(phaseText, '### 6.8.1 '));
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, `fact ${key}`);
    }
    const rows = dependencyTable(phaseText);
    for (const [id, status] of Object.entries(EXPECTED_DEPENDENCIES)) {
      assert.equal(rows.get(id), status, `dependency ${id}`);
    }
  });

  it('keeps its dependency keys disjoint from the earlier gates', () => {
    const earlier = new Set();
    for (const heading of ['### 6.6.4 ', '### 6.7.4 ']) {
      for (const line of sectionBody(phaseText, heading).split('\n')) {
        const m = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim());
        if (m) earlier.add(`${m[1]} :: ${m[2]}`);
      }
    }
    for (const key of dependencyTable(phaseText).keys()) {
      assert.ok(!earlier.has(key), `§6.8.5 repeats an earlier key "${key}"`);
    }
  });
});

describe('APP3-DB01 — the migration itself', () => {
  it('rejects a missing migration', () => {
    const dir = baseRoot();
    const target = join(dir, CANONICAL_FILES.migration);
    rmSync(target);
    try {
      assert.ok(mentions(checkApp3Db01(dir), 'canonical file is missing'));
    } finally {
      cpSync(join(REPO_ROOT, CANONICAL_FILES.migration), target);
    }
  });

  it('rejects a journal whose last tag is not this migration', () => {
    const journal = JSON.parse(read(CANONICAL_FILES.journal));
    journal.entries[journal.entries.length - 1].tag = '0034_something_else';
    const failures = run({ [CANONICAL_FILES.journal]: JSON.stringify(journal, null, 2) });
    assert.ok(mentions(failures, 'last journal tag is'));
  });

  it('rejects a journal that has lost an entry', () => {
    const journal = JSON.parse(read(CANONICAL_FILES.journal));
    journal.entries.pop();
    const failures = run({ [CANONICAL_FILES.journal]: JSON.stringify(journal, null, 2) });
    assert.ok(mentions(failures, 'journal entries for'));
  });

  it('rejects a rollback section, a dropped table or a network call', () => {
    for (const [smuggled, needle] of [
      ['\n-- Down\nALTER TABLE "product_sides" DROP COLUMN "code";\n', 'down/rollback section'],
      ['\nDROP TABLE "product_sides";\n', 'a DROP TABLE'],
      ["\nSELECT dblink('host=example', 'select 1');\n", 'object-storage or network call'],
      ['\nCREATE EXTENSION "uuid-ossp";\n', 'an extension install'],
      ['\nCREATE TABLE "app3_notes" (id uuid);\n', 'a table is created'],
    ]) {
      const failures = run({ [CANONICAL_FILES.migration]: migrationText + smuggled });
      assert.ok(mentions(failures, needle), needle);
    }
  });

  it('rejects a second APP3 migration file', () => {
    const dir = baseRoot();
    const extra = join(dir, `packages/database/migrations/0035_more_placement_authority.sql`);
    writeFileSync(extra, '-- APP3-DB01 second half\n', 'utf8');
    try {
      const failures = checkApp3Db01(dir);
      assert.ok(mentions(failures, 'expected exactly one APP3-DB01 migration'));
    } finally {
      rmSync(extra);
    }
  });

  it('names its own tag in the fact table', () => {
    assert.ok(mentions(factChanged('Migration tag', '0035_something'), '`Migration tag`'));
    assert.equal(EXPECTED_FACTS['Migration tag'], MIGRATION_TAG);
  });
});

describe('APP3-DB01 — the placement backfill order', () => {
  it('rejects SET NOT NULL before the backfill', () => {
    const reordered = migrationText.replace(
      'UPDATE "product_sides"\n   SET "code" = \'legacy-\' || replace("id"::text, \'-\', \'\')\n WHERE "code" IS NULL;--> statement-breakpoint',
      'ALTER TABLE "product_sides" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint',
    );
    const failures = run({ [CANONICAL_FILES.migration]: reordered });
    assert.ok(mentions(failures, 'has no backfill after the nullable add'));
  });

  it('rejects adding code as NOT NULL in one step', () => {
    const eager = migrationText.replace(
      'ALTER TABLE "product_sides" ADD COLUMN "code" text;',
      'ALTER TABLE "product_sides" ADD COLUMN "code" text NOT NULL;',
    );
    const failures = run({ [CANONICAL_FILES.migration]: eager });
    assert.ok(mentions(failures, 'is not added as a nullable column first'));
  });

  it('rejects a non-deterministic backfill expression', () => {
    const random = migrationText.replaceAll(
      `'legacy-' || replace("id"::text, '-', '')`,
      `'legacy-' || replace(gen_random_uuid()::text, '-', '')`,
    );
    const failures = run({ [CANONICAL_FILES.migration]: random });
    assert.ok(mentions(failures, 'deterministic legacy-code backfill expression is gone'));
  });

  it('rejects dropping the backfill proof', () => {
    const unproven = migrationText.replace(
      /DO \$\$\nDECLARE\n  v_null bigint;[\s\S]*?\$\$;--> statement-breakpoint\n/,
      '',
    );
    assert.notEqual(unproven, migrationText, 'the proof block anchor moved');
    const failures = run({ [CANONICAL_FILES.migration]: unproven });
    assert.ok(mentions(failures, 'is not proved before'));
  });
});

describe('APP3-DB01 — placement identity and replacement', () => {
  it('rejects a code that is globally unique', () => {
    const global = migrationText.replace('UNIQUE("product_id","code")', 'UNIQUE("code")');
    const failures = run({ [CANONICAL_FILES.migration]: global });
    assert.ok(mentions(failures, 'uniqueness is not scoped to the Product'));
    assert.ok(mentions(failures, 'identity is per parent'));
  });

  it('rejects losing a per-table constraint', () => {
    for (const constraint of [
      'ck_product_sides__code_format',
      'ck_product_sides__superseded_requires_retired',
      'ck_product_sides__superseded_not_self',
      'fk_embroidery_areas__superseded_by_id',
      'uq_embroidery_areas__side_code',
    ]) {
      // Renamed to a string that does *not* contain the original, or the
      // `includes` check would still find it and the case would pass vacuously.
      const stripped = migrationText.replaceAll(constraint, 'ck_renamed__elsewhere');
      const failures = run({ [CANONICAL_FILES.migration]: stripped });
      assert.ok(mentions(failures, `\`${constraint}\` is missing`), constraint);
    }
  });

  it('rejects losing a replacement guard trigger', () => {
    for (const trigger of [
      'tg_product_sides__replacement_guard',
      'tg_embroidery_areas__protected_guard',
    ]) {
      const stripped = migrationText.replaceAll(trigger, 'tg_renamed__elsewhere');
      const failures = run({ [CANONICAL_FILES.migration]: stripped });
      assert.ok(mentions(failures, `trigger \`${trigger}\` is missing`), trigger);
    }
  });

  it('rejects dropping the cross-parent or cycle rejection', () => {
    const noParent = migrationText.replace(
      'only be superseded within the same',
      'be superseded by any row of any',
    );
    assert.ok(mentions(run({ [CANONICAL_FILES.migration]: noParent }), 'cross-parent replacement'));

    const noCycle = migrationText.replace('supersede each other', 'point at each other harmlessly');
    assert.ok(
      mentions(run({ [CANONICAL_FILES.migration]: noCycle }), 'direct two-row replacement cycle'),
    );
  });

  it('rejects a generic recursive replacement walk', () => {
    const recursive = migrationText.replace(
      'IF v_target_superseded = NEW.id THEN',
      'WITH RECURSIVE chain AS (SELECT 1) SELECT 1;\n  IF v_target_superseded = NEW.id THEN',
    );
    const failures = run({ [CANONICAL_FILES.migration]: recursive });
    assert.ok(mentions(failures, 'only the direct cycle is ruled'));
  });

  it('rejects the schema losing a placement column or its nullability', () => {
    const noRetired = sidesText.replace("    retiredAt: instant('retired_at'),\n", '');
    let failures = run({ [CANONICAL_FILES.productSides]: noRetired });
    assert.ok(mentions(failures, 'required column `retired_at` is not declared'));

    const notNull = sidesText.replace(
      "retiredAt: instant('retired_at'),",
      "retiredAt: instant('retired_at').notNull(),",
    );
    failures = run({ [CANONICAL_FILES.productSides]: notNull });
    assert.ok(mentions(failures, '`retired_at` became NOT NULL'));

    const nullableCode = sidesText.replace("code: text('code').notNull(),", "code: text('code'),");
    failures = run({ [CANONICAL_FILES.productSides]: nullableCode });
    assert.ok(mentions(failures, '`code` is not declared NOT NULL'));
  });
});

describe('APP3-DB01 — referenced-row protection', () => {
  it('rejects losing a protection source', () => {
    // Both branches of each source must go: the Side branch and the Area branch
    // are separate `EXISTS` blocks, and leaving one behind would let the case
    // pass while the guard is half-gone.
    for (const [replacements, needle] of [
      [
        [
          ['design_templates t WHERE t.product_side_id', 'design_templates t WHERE t.gone'],
          ['design_templates t WHERE t.embroidery_area_id', 'design_templates t WHERE t.gone'],
        ],
        'Template header',
      ],
      [[["NOT IN ('EXPIRED', 'DELETED')", "IN ('NEVER_A_STATE')"]], 'non-terminal Session'],
      [
        [
          ['approval_snapshots a WHERE a.product_side_id', 'approval_snapshots a WHERE a.gone'],
          ['approval_snapshots a WHERE a.embroidery_area_id', 'approval_snapshots a WHERE a.gone'],
        ],
        'approval snapshot',
      ],
    ]) {
      let broken = migrationText;
      for (const [from, to] of replacements) {
        assert.ok(broken.includes(from), `anchor moved: ${from}`);
        broken = broken.replaceAll(from, to);
      }
      const failures = run({ [CANONICAL_FILES.migration]: broken });
      assert.ok(mentions(failures, `${needle} protection source is missing`), needle);
    }
  });

  it('rejects unfreezing a protected identity or geometry column', () => {
    for (const [entity, columns] of Object.entries(PROTECTED_COLUMNS)) {
      for (const column of columns.slice(0, 3)) {
        const weakened = migrationText.replace(
          new RegExp(`('${entity}',[\\s\\S]{0,400}?)'${column}', `),
          '$1',
        );
        assert.notEqual(weakened, migrationText, `${entity}/${column} anchor moved`);
        const failures = run({ [CANONICAL_FILES.migration]: weakened });
        assert.ok(mentions(failures, `no longer freezes \`${column}\``), `${entity}/${column}`);
      }
    }
  });

  it('rejects freezing a column that must stay editable', () => {
    const overreach = migrationText.replace(
      "  'product_side',\n  'product_id', 'code',",
      "  'product_side',\n  'name', 'display_order', 'product_id', 'code',",
    );
    assert.notEqual(overreach, migrationText, 'the protected-column list anchor moved');
    const failures = run({ [CANONICAL_FILES.migration]: overreach });
    assert.ok(mentions(failures, 'which must stay editable on a protected row'));
  });

  it('rejects allowing a protected hard delete or introducing a cascade', () => {
    const deletable = migrationText.replace(
      'cannot be deleted; retire it instead',
      'may be deleted freely',
    );
    assert.ok(
      mentions(run({ [CANONICAL_FILES.migration]: deletable }), 'protected from hard delete'),
    );

    const cascade = migrationText.replace(
      'ON DELETE restrict ON UPDATE no action;--> statement-breakpoint\nALTER TABLE "embroidery_areas" ADD CONSTRAINT "fk_embroidery_areas__superseded_by_id"',
      'ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE "embroidery_areas" ADD CONSTRAINT "fk_embroidery_areas__superseded_by_id"',
    );
    assert.notEqual(cascade, migrationText, 'the FK anchor moved');
    assert.ok(
      mentions(run({ [CANONICAL_FILES.migration]: cascade }), 'cascade delete was introduced'),
    );
  });

  it('rejects moving protection out of the database', () => {
    const noTrigger = migrationText.replaceAll(
      'CREATE OR REPLACE FUNCTION public.fn_app3_reject_protected_placement_change',
      'CREATE OR REPLACE FUNCTION public.fn_app3_unused_helper',
    );
    const failures = run({ [CANONICAL_FILES.migration]: noTrigger });
    assert.ok(mentions(failures, 'protection function is missing'));
  });
});

describe('APP3-DB01 — derivative metadata', () => {
  it('rejects a missing quartet column', () => {
    for (const column of METADATA_COLUMNS) {
      const stripped = migrationText.replace(
        `ALTER TABLE "asset_derivatives" ADD COLUMN "${column}"`,
        `-- removed "${column}"`,
      );
      const failures = run({ [CANONICAL_FILES.migration]: stripped });
      assert.ok(mentions(failures, `derivative column \`${column}\` is not added`), column);
    }
  });

  it('rejects making the quartet NOT NULL', () => {
    const eager = `${migrationText}\nALTER TABLE "asset_derivatives" ALTER COLUMN "width_px" SET NOT NULL;`;
    const failures = run({ [CANONICAL_FILES.migration]: eager });
    assert.ok(mentions(failures, 'historical rows must stay representable'));
  });

  it('rejects losing a metadata CHECK', () => {
    for (const constraint of [
      'ck_asset_derivatives__metadata_all_or_none',
      'ck_asset_derivatives__metadata_positive',
      'ck_asset_derivatives__ready_normalized_metadata',
    ]) {
      const stripped = migrationText.replaceAll(constraint, 'ck_renamed__elsewhere');
      const failures = run({ [CANONICAL_FILES.migration]: stripped });
      assert.ok(mentions(failures, `\`${constraint}\` is missing`), constraint);
    }
  });

  it('rejects weakening all-or-none to "any subset"', () => {
    const weakened = migrationText.replaceAll('in (0, 4)', 'in (0, 1, 2, 3, 4)');
    const failures = run({ [CANONICAL_FILES.migration]: weakened });
    assert.ok(mentions(failures, 'all-or-none invariant is not "0 or 4"'));
  });

  it('rejects a media-type check that only trims spaces', () => {
    const weakened = migrationText.replace(
      `btrim("asset_derivatives"."media_type", E' \\t\\r\\n') <> ''`,
      `btrim("asset_derivatives"."media_type") <> ''`,
    );
    assert.notEqual(weakened, migrationText, 'the media-type anchor moved');
    const failures = run({ [CANONICAL_FILES.migration]: weakened });
    assert.ok(mentions(failures, 'no longer trims tabs and newlines'));
  });

  it('rejects dropping the READY editor-safe requirement', () => {
    const weakened = migrationText.replace(
      /CHECK \("asset_derivatives"\."kind" <> 'NORMALIZED' or[\s\S]*?= 4\);/,
      'CHECK (true);',
    );
    assert.notEqual(weakened, migrationText, 'the eligibility anchor moved');
    const failures = run({ [CANONICAL_FILES.migration]: weakened });
    assert.ok(mentions(failures, 'no longer requires the quartet'));
  });

  it('rejects a fabricated derivative backfill', () => {
    const fabricated = `${migrationText}\nUPDATE "asset_derivatives" SET "width_px" = 1024, "height_px" = 1024, "media_type" = 'image/webp', "byte_size" = 1;`;
    const failures = run({ [CANONICAL_FILES.migration]: fabricated });
    assert.ok(mentions(failures, 'values are never fabricated'));
  });

  it('rejects a forbidden column or a new derivative kind', () => {
    const smuggledColumn = `${migrationText}\nALTER TABLE "asset_derivatives" ADD COLUMN "inspection_detail_id" uuid;`;
    assert.ok(mentions(run({ [CANONICAL_FILES.migration]: smuggledColumn }), 'forbidden column'));

    const smuggledKind = derivativesText.replace(
      "  'NORMALIZED',",
      "  'NORMALIZED',\n  'EDITOR_SAFE',",
    );
    assert.ok(
      mentions(run({ [CANONICAL_FILES.derivatives]: smuggledKind }), 'forbidden derivative kind'),
    );
  });
});

describe('APP3-DB01 — recorded state matches the schema', () => {
  it('rejects a contribution state that still says pending', () => {
    for (const key of ['G01_DB_CONTRIBUTION_STATE', 'G04_DB_CONTRIBUTION_STATE']) {
      assert.ok(mentions(factChanged(key, 'PENDING'), `\`${key}\` is "PENDING"`), key);
    }
  });

  it('rejects a downstream status that contradicts the ruled map', () => {
    const failures = failuresAfter(
      'phase',
      '| `APP3-B02` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_B01_AND_APP3_B06` |',
      '| `APP3-B02` | whole checkpoint, post-DB01 | `READY — NOT STARTED` |',
    );
    assert.ok(mentions(failures, 'APP3-B02 :: whole checkpoint, post-DB01'));
  });

  it('rejects closing the dimensions follow-up here', () => {
    const failures = failuresAfter(
      'phase',
      '| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | authority, post-DB01 | `OPEN — AUTHORITY_LOCKED_BY_APP3-G04` |',
      '| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | authority, post-DB01 | `COMPLETE — CLOSED_BY_APP3-DB01` |',
    );
    assert.ok(mentions(failures, 'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: authority'));
  });

  it('rejects reopening the G03 bound follow-up', () => {
    const failures = failuresAfter(
      'phase',
      '| `FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` | whole follow-up, post-DB01 | `COMPLETE — CLOSED_BY_APP3-DB01` |',
      '| `FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` | whole follow-up, post-DB01 | `OPEN` |',
    );
    assert.ok(mentions(failures, 'FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01'));
  });

  /**
   * The absence check accepts two worlds and refuses every mixture.
   *
   * `APP3-DB01` was the frontier when it ran; `APP3-B01` has since shipped the
   * three placement operations. Asserting an absolute absence would mean
   * deleting the check the first time it mattered.
   */
  it('rejects an APP3 operation no delivered checkpoint owns', () => {
    const openapi = JSON.parse(read(CANONICAL_FILES.openapi));
    openapi.paths['/api/admin/products/{productId}/placements'] = {
      post: { operationId: 'smuggled' },
    };
    const failures = run({ [CANONICAL_FILES.openapi]: JSON.stringify(openapi) });
    assert.ok(mentions(failures, 'belongs to no delivered APP3 checkpoint'), failures.join('\n'));
  });

  it('rejects a placement operation while APP3-B01 is not recorded complete', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: read(CANONICAL_FILES.phase).replaceAll(
        'APP3-B01 = COMPLETE',
        'APP3-B01 = READY — NOT STARTED',
      ),
    });
    assert.ok(mentions(failures, 'no APP3 backend checkpoint has run'), failures.join('\n'));
  });

  it('propagates an APP3-G04 regression, including its schema mode', () => {
    const noColumns = derivativesText
      .replace("    widthPx: integer('width_px'),\n", '')
      .replace("    heightPx: integer('height_px'),\n", '')
      .replace("    mediaType: text('media_type'),\n", '')
      .replace("    byteSize: bigint('byte_size', { mode: 'bigint' }),\n", '');
    const failures = run({ [CANONICAL_FILES.derivatives]: noColumns });
    assert.ok(mentions(failures, 'APP3-G04 regression'));
    assert.ok(mentions(failures, 'is not declared in the schema'));
  });
});
