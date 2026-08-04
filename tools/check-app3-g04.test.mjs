/**
 * Regressions for the `APP3-G04` media-authority gate (IMP-D044).
 *
 * Every case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked authority.
 *
 * The cases worth reading twice are the schema-mode ones. This gate was written
 * after an attempt that failed because its ruling asserted a schema fact the
 * repository contradicted, so the interesting question is never "does it pass
 * today" but "does it still tell the truth on the other side of `APP3-DB01`".
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
  FORBIDDEN_KINDS,
  METADATA_COLUMNS,
  REPO_ROOT,
  checkApp3G04,
  dependencyTable,
} from './check-app3-g04.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { sectionBody, tableRows } from './check-app3-g02.mjs';

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const phaseText = read(CANONICAL_FILES.phase);
const registerText = read(CANONICAL_FILES.register);
const securityText = read(CANONICAL_FILES.security);
const derivativesText = read(CANONICAL_FILES.derivatives);

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const CANONICAL = new Set([
  ...Object.values(CANONICAL_FILES),
  ...Object.values(G01_FILES),
  ...Object.values(G02_FILES),
  ...Object.values(G03_FILES),
]);

/**
 * One throwaway root, built once and restored between cases.
 *
 * The obvious harness — a fresh temporary root per case — copies the whole
 * `.git` directory sixty times, because the G01 chronology half reads real
 * history. That turns a fast suite into a slow one nobody runs. So the root is
 * built once and each case writes its edit, asserts, and puts the original file
 * back; `node:test` runs subtests sequentially, so no two cases share a state.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-g04-'));
  temporaries.push(base);
  for (const relative of CANONICAL) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  // G03 reads the API design module; the G01 chronology half reads real history.
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
    return checkApp3G04(dir);
  } finally {
    for (const relative of touched) cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
}

const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

const SOURCES = {
  phase: () => phaseText,
  register: () => registerText,
  security: () => securityText,
  derivatives: () => derivativesText,
};

/** Failures after one substitution in a named canonical file. */
function failuresAfter(key, from, to) {
  const source = SOURCES[key]();
  assert.ok(source.includes(from), `${key} is missing the anchor: ${from.slice(0, 70)}`);
  return run({ [CANONICAL_FILES[key]]: source.replace(from, to) }).failures;
}

/** One §6.7.1 fact rewritten to a different value. */
function factChanged(key, replacement) {
  const from = `| \`${key}\` | \`${EXPECTED_FACTS[key]}\` |`;
  return failuresAfter('phase', from, `| \`${key}\` | \`${replacement}\` |`);
}

describe('APP3-G04 — the repository as it stands', () => {
  it('passes, before APP3-DB01', () => {
    const { failures, mode } = checkApp3G04(REPO_ROOT);
    assert.deepEqual(failures, []);
    assert.equal(mode, 'REQUIRED_SCHEMA_CONTRIBUTION_PENDING');
  });

  it('records every ruled fact and dependency row', () => {
    const facts = tableRows(sectionBody(phaseText, '### 6.7.1 '));
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, `fact ${key}`);
    }
    const rows = dependencyTable(phaseText);
    for (const [id, status] of Object.entries(EXPECTED_DEPENDENCIES)) {
      assert.equal(rows.get(id), status, `dependency ${id}`);
    }
  });

  it('keeps its keys disjoint from the §6.6.4 table G03 asserts', () => {
    // G03 bounds §6.6.4 with a literal `## 7.`, so it reads §6.7.4 as well; a
    // repeated `id :: portion` key would silently overwrite its statuses.
    const g03Keys = new Set(
      sectionBody(phaseText, '### 6.6.4 ')
        .split('\n')
        .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
        .filter(Boolean)
        .map((m) => `${m[1]} :: ${m[2]}`),
    );
    for (const key of dependencyTable(phaseText).keys()) {
      assert.ok(!g03Keys.has(key), `§6.7.4 repeats the G03 key "${key}"`);
    }
  });
});

describe('APP3-G04 — the editor-safe derivative moves', () => {
  it('rejects a derivative other than the reused kind', () => {
    const failures = factChanged('Editor-safe derivative kind', 'PREVIEW_WATERMARKED');
    assert.ok(mentions(failures, '`Editor-safe derivative kind` is "PREVIEW_WATERMARKED"'));
  });

  it('rejects a new editor derivative kind in the schema', () => {
    for (const kind of FORBIDDEN_KINDS) {
      const { failures } = run({
        [CANONICAL_FILES.derivatives]: derivativesText.replace(
          "  'NORMALIZED',",
          `  'NORMALIZED',\n  '${kind}',`,
        ),
      });
      assert.ok(mentions(failures, `derivative kind \`${kind}\` exists`), kind);
    }
  });

  it('rejects the reused kind disappearing from the schema', () => {
    const { failures } = run({
      [CANONICAL_FILES.derivatives]: derivativesText.replace("  'NORMALIZED',\n", ''),
    });
    assert.ok(mentions(failures, 'is no longer a derivative kind'));
  });

  it('rejects making a watermarked or catalog derivative Studio-eligible', () => {
    for (const key of [
      'PREVIEW_WATERMARKED studio eligibility',
      'CATALOG_PREVIEW studio eligibility',
      'Original studio eligibility',
    ]) {
      assert.ok(mentions(factChanged(key, 'ELIGIBLE'), `\`${key}\` is "ELIGIBLE"`), key);
    }
  });

  it('rejects a processing profile promoted into the database', () => {
    assert.ok(
      mentions(
        factChanged('Processing profile persistence', 'DB_ENUM'),
        '`Processing profile persistence` is "DB_ENUM"',
      ),
    );
    assert.ok(
      mentions(factChanged('Processing profile column', 'profile'), '`Processing profile column`'),
    );
  });
});

describe('APP3-G04 — an intake lane is widened', () => {
  it('rejects SVG or an original on the side background', () => {
    assert.ok(mentions(factChanged('Side background svg', 'ACCEPTED'), '`Side background svg`'));
    assert.ok(
      mentions(
        factChanged('Side background accepted sources', 'JPEG PNG WEBP SVG'),
        '`Side background accepted sources`',
      ),
    );
    assert.ok(
      mentions(
        factChanged('Side background delivery context', 'ANY_PRODUCT'),
        '`Side background delivery context`',
      ),
    );
  });

  it('rejects Template SVG without mandatory sanitization', () => {
    assert.ok(
      mentions(factChanged('Template asset svg sanitization', 'OPTIONAL'), '`Template asset svg'),
    );
    const failures = failuresAfter(
      'phase',
      'and **only** after mandatory\nserver-side sanitization',
      'and after best-effort client-side cleanup',
    );
    assert.ok(mentions(failures, 'server-side sanitization'));
  });

  it('rejects an anonymous Session accepting SVG', () => {
    assert.ok(mentions(factChanged('Session upload svg', 'ACCEPTED'), '`Session upload svg`'));
    const failures = failuresAfter('security', 'no anonymous SVG intake', 'anonymous SVG is fine');
    assert.ok(mentions(failures, 'the anonymous SVG rejection'));
  });

  it('rejects a Session upload becoming public or shared', () => {
    assert.ok(
      mentions(factChanged('Session upload visibility', 'PUBLIC'), '`Session upload visibility`'),
    );
    assert.ok(
      mentions(
        factChanged('Session upload reuse as shared media', 'ALLOWED'),
        '`Session upload reuse as shared media`',
      ),
    );
  });

  it('rejects a generic public Asset endpoint', () => {
    assert.ok(
      mentions(
        factChanged('Generic public asset endpoint', 'GET /assets/:id'),
        '`Generic public asset endpoint`',
      ),
    );
    assert.ok(
      mentions(
        factChanged('Staff auth for storefront delivery', 'ALLOWED'),
        '`Staff auth for storefront delivery`',
      ),
    );
  });
});

describe('APP3-G04 — dimensions or limits are weakened', () => {
  it('rejects optional or guessed intrinsic dimensions', () => {
    assert.ok(
      mentions(factChanged('Missing dimension result', 'INFERRED'), '`Missing dimension result`'),
    );
    assert.ok(
      mentions(
        factChanged('Studio dimension fields', 'width_px height_px'),
        '`Studio dimension fields`',
      ),
    );
    assert.ok(
      mentions(
        factChanged('Svg width height without viewbox', 'SUFFICIENT'),
        '`Svg width height without viewbox`',
      ),
    );
  });

  it('rejects inspection history or source metadata as the dimension authority', () => {
    assert.ok(
      mentions(
        factChanged('Dimension authority table', 'asset_inspections'),
        '`Dimension authority table`',
      ),
    );
    assert.ok(
      mentions(
        factChanged('Inspection detail runtime authority', 'ALLOWED'),
        '`Inspection detail runtime authority`',
      ),
    );
    assert.ok(
      mentions(
        factChanged('Source asset metadata as derivative metadata', 'ALLOWED'),
        '`Source asset metadata as derivative metadata`',
      ),
    );
  });

  it('rejects every upload, SVG and document limit being changed', () => {
    const limits = {
      'Raster upload max bytes': '20971520',
      'Raster max width px': '8192',
      'Raster max height px': '8192',
      'Raster max decoded pixels': '33554432',
      'Admin svg max bytes': '2097152',
      'Sanitized svg max nodes': '20000',
      'Sanitized svg max path characters': '2000000',
      'Document max serialized bytes': '1048576',
      'Document max elements': '200',
      'Document max image elements': '40',
      'Document max text elements': '160',
      'Document max unique assets': '40',
      'Document max group depth': '16',
      'Document max characters per text element': '1000',
      'Document max total text characters': '10000',
      'Document max decoded pixels': '67108864',
    };
    for (const [key, raised] of Object.entries(limits)) {
      assert.ok(mentions(factChanged(key, raised), `\`${key}\` is "${raised}"`), key);
    }
  });

  it('rejects a limit removed from the security document', () => {
    const failures = failuresAfter('security', '**16,777,216**', '**a reasonable number of**');
    assert.ok(mentions(failures, 'the decoded-pixel ceiling'));
  });

  it('rejects partial saves and silent limit increases', () => {
    assert.ok(
      mentions(
        factChanged('Document partial save on rejection', 'ALLOWED'),
        '`Document partial save on rejection`',
      ),
    );
    assert.ok(mentions(factChanged('Silent limit increase', 'ALLOWED'), '`Silent limit increase`'));
    assert.ok(
      mentions(factChanged('Document limit enforcement', 'CLIENT_SIDE'), '`Document limit'),
    );
  });
});

describe('APP3-G04 — fonts and the watermark', () => {
  it('rejects an arbitrary, remote or user-supplied font', () => {
    for (const key of [
      'Remote runtime font url',
      'User uploaded font',
      'Template embedded font bytes',
    ]) {
      assert.ok(mentions(factChanged(key, 'ALLOWED'), `\`${key}\` is "ALLOWED"`), key);
    }
    assert.ok(
      mentions(factChanged('Document font reference', 'fontFamily'), '`Document font reference`'),
    );
    assert.ok(mentions(factChanged('Unknown fontId', 'SILENT_FALLBACK'), '`Unknown fontId`'));
  });

  it('rejects a serialized or baked watermark', () => {
    assert.ok(
      mentions(
        factChanged('Watermark in editor-safe bytes', 'BAKED'),
        '`Watermark in editor-safe bytes`',
      ),
    );
    assert.ok(
      mentions(factChanged('Watermark serialization', 'SERIALIZED'), '`Watermark serialization`'),
    );
    assert.ok(
      mentions(
        factChanged('Export or download surface', 'ENABLED'),
        '`Export or download surface`',
      ),
    );
  });
});

describe('APP3-G04 — authority and repository facts move', () => {
  it('rejects a missing decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    assert.ok(row);
    const failures = failuresAfter('register', `${row}\n`, '');
    assert.ok(mentions(failures, `${DECISION_ID} appears 0 times`));
  });

  it('rejects a duplicated decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, `${row}\n${row}`);
    assert.ok(mentions(failures, `${DECISION_ID} appears 2 times`));
  });

  it('rejects an unlocked decision', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, row.replace(/\| LOCKED \|$/, '| PROPOSED |'));
    assert.ok(mentions(failures, 'is not LOCKED'));
  });

  it('rejects a decision missing one of the twelve rulings', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter('register', row, row.replaceAll('PO-12', 'PO-99'));
    assert.ok(mentions(failures, 'does not record ruling PO-12'));
  });

  it('rejects a decision that drops the metadata contract', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = failuresAfter(
      'register',
      row,
      row.replaceAll('never runtime state authority', 'the authoritative source'),
    );
    assert.ok(mentions(failures, 'never runtime authority'));
  });

  it('rejects an APP3 asset operation appearing in OpenAPI', () => {
    const openapi = JSON.parse(read(CANONICAL_FILES.openapi));
    openapi.paths['/api/public/products/{slug}/sides/{sideId}/background'] = {
      get: { operationId: 'smuggled' },
    };
    const { failures } = run({ [CANONICAL_FILES.openapi]: JSON.stringify(openapi) });
    assert.ok(mentions(failures, 'APP3 asset operation'));
  });

  it('rejects losing the source-metadata or placement-geometry columns', () => {
    const assets = read(CANONICAL_FILES.assets);
    const { failures } = run({
      [CANONICAL_FILES.assets]: assets.replace("mimeType: text('mime_type').notNull(),", ''),
    });
    assert.ok(mentions(failures, 'source column `mime_type` is gone'));

    const sides = read(CANONICAL_FILES.productSides);
    const geometry = run({
      [CANONICAL_FILES.productSides]: sides.replace("pxPerMm: numeric('px_per_mm').notNull(),", ''),
    }).failures;
    assert.ok(mentions(geometry, 'placement geometry column `px_per_mm` is gone'));
  });

  it('rejects the append-only inspection evidence column disappearing', () => {
    const inspections = read(CANONICAL_FILES.inspections);
    const { failures } = run({
      [CANONICAL_FILES.inspections]: inspections.replace("detail: text('detail'),", ''),
    });
    assert.ok(mentions(failures, 'append-only `detail` evidence column is gone'));
  });

  it('rejects a follow-up closed or reopened against its ruling', () => {
    const failures = failuresAfter(
      'phase',
      '| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | authority | `OPEN — AUTHORITY_LOCKED_BY_APP3-G04` |',
      '| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | authority | `COMPLETE — CLOSED_BY_APP3-G04` |',
    );
    assert.ok(mentions(failures, 'FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 :: authority'));

    const bound = failuresAfter(
      'phase',
      '| `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01` | whole follow-up | `COMPLETE — CLOSED_BY_APP3-G04` |',
      '| `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01` | whole follow-up | `OPEN` |',
    );
    assert.ok(mentions(bound, 'FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01'));
  });

  it('propagates a predecessor authority regression', () => {
    const { failures } = run({
      [G01_FILES.phase]: phaseText.replace(
        '| `G01_DB_DISPOSITION` | `REQUIRES_APP3_DB01` |',
        '| `G01_DB_DISPOSITION` | `NOT_REQUIRED` |',
      ),
    });
    assert.ok(mentions(failures, 'APP3-G03 regression'));
    assert.ok(mentions(failures, 'APP3-G01 regression'));
  });
});

/**
 * The schema-contribution modes.
 *
 * `APP3-DB01` has not run, so state B is simulated by writing the migration's
 * declared shape into a throwaway copy of the schema file. That is the point:
 * the gate has to be right about a world that does not exist yet, or it will be
 * deleted rather than updated on the day it does.
 */
describe('APP3-G04 — the derivative metadata contribution', () => {
  const withColumns = derivativesText.replace(
    "    isWatermarked: boolean('is_watermarked').notNull(),",
    [
      "    isWatermarked: boolean('is_watermarked').notNull(),",
      "    widthPx: integer('width_px'),",
      "    heightPx: integer('height_px'),",
      "    mediaType: text('media_type'),",
      "    byteSize: bigint('byte_size', { mode: 'bigint' }),",
    ].join('\n'),
  );
  const withChecks = withColumns.replace(
    "    index('ix_asset_derivatives__asset').on(t.assetId),",
    [
      '    check(',
      "      'ck_asset_derivatives__metadata_all_or_none',",
      '      sql`num_nonnulls(${t.widthPx}, ${t.heightPx}, ${t.mediaType}, ${t.byteSize}) in (0, 4)`,',
      '    ),',
      '    check(',
      "      'ck_asset_derivatives__metadata_positive',",
      '      sql`(${t.widthPx} is null or ${t.widthPx} > 0) and (${t.heightPx} is null or ${t.heightPx} > 0) and (${t.byteSize} is null or ${t.byteSize} > 0)`,',
      '    ),',
      "    index('ix_asset_derivatives__asset').on(t.assetId),",
    ].join('\n'),
  );
  const db01Delivered = phaseText.replace(
    '| `APP3-DB01` | whole checkpoint, post-G04 | `REQUIRED — READY_FOR_EXECUTION` |',
    '| `APP3-DB01` | whole checkpoint, post-G04 | `COMPLETE — REVIEW_ACCEPTED` |',
  );

  it('passes after APP3-DB01, in the implemented mode', () => {
    const { failures, mode } = run({
      [CANONICAL_FILES.derivatives]: withChecks,
      [CANONICAL_FILES.phase]: db01Delivered,
    });
    assert.deepEqual(failures, []);
    assert.equal(mode, 'DERIVATIVE_METADATA_IMPLEMENTED');
  });

  it('rejects half the columns existing', () => {
    const half = derivativesText.replace(
      "    isWatermarked: boolean('is_watermarked').notNull(),",
      "    isWatermarked: boolean('is_watermarked').notNull(),\n    widthPx: integer('width_px'),\n    heightPx: integer('height_px'),",
    );
    const { failures, mode } = run({ [CANONICAL_FILES.derivatives]: half });
    assert.ok(mentions(failures, 'derivative metadata is half-added'));
    assert.equal(mode, 'INCONSISTENT');
  });

  it('rejects the columns landing without their constraints', () => {
    const { failures } = run({
      [CANONICAL_FILES.derivatives]: withColumns,
      [CANONICAL_FILES.phase]: db01Delivered,
    });
    assert.ok(mentions(failures, 'the all-or-none invariant is missing'));
    assert.ok(mentions(failures, 'positive width/height checks'));
  });

  it('rejects a contribution of NONE while the columns are absent', () => {
    const failures = factChanged('G04_DB_CONTRIBUTION', 'NONE');
    assert.ok(mentions(failures, '`G04_DB_CONTRIBUTION` is "NONE"'));
  });

  it('rejects APP3-DB01 claiming completion while the columns are absent', () => {
    const { failures, mode } = run({ [CANONICAL_FILES.phase]: db01Delivered });
    assert.ok(mentions(failures, 'while no derivative metadata column exists'));
    assert.equal(mode, 'INCONSISTENT');
  });

  it('rejects a contribution still pending after the columns land', () => {
    const { failures } = run({ [CANONICAL_FILES.derivatives]: withChecks });
    assert.ok(mentions(failures, 'still recorded as "REQUIRED — READY_FOR_EXECUTION"'));
  });

  it('rejects a forbidden column added alongside the quartet', () => {
    const smuggled = withChecks.replace(
      "    mediaType: text('media_type'),",
      "    mediaType: text('media_type'),\n    inspectionDetailId: text('inspection_detail_id'),",
    );
    const { failures } = run({
      [CANONICAL_FILES.derivatives]: smuggled,
      [CANONICAL_FILES.phase]: db01Delivered,
    });
    assert.ok(mentions(failures, 'column `inspection_detail_id` exists'));
  });

  it('names all four columns in one place', () => {
    assert.deepEqual(METADATA_COLUMNS, ['width_px', 'height_px', 'media_type', 'byte_size']);
    for (const column of METADATA_COLUMNS) {
      assert.ok(EXPECTED_FACTS['Derivative metadata columns'].includes(column), column);
      assert.ok(!derivativesText.includes(`'${column}'`), `${column} already exists in the schema`);
    }
  });
});
