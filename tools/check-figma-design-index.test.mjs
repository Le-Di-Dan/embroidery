/**
 * Tests for the Figma Design Index consistency gate.
 * Pure Node (node:test); writes disposable fixtures under the OS temp dir.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFigmaDesignIndex, INDEX_PATH, PHASE_PLAN_PATH } from './check-figma-design-index.mjs';
import {
  CANONICAL_TITLE,
  A03_APPROVAL_EVIDENCE,
  A03_REQUIRED_ROWS,
} from './check-figma-design-index.structure.mjs';

const PRODUCT = 'BQwqV8GdfUIELvsQDB1UQE';
const DS = 'hsxSjwkqQKM9vuyRgWSesU';

const CATALOG = [
  '| Registry ID | File | File Key | Purpose | File URL | Write Authority | Content Class |',
  '|---|---|---|---|---|---|---|',
  `| FIG-FILE-PRODUCT | embroidery | ${PRODUCT} | Product screens | https://www.figma.com/design/${PRODUCT}/embroidery | Write | Product |`,
  `| FIG-FILE-DS | DS Core | ${DS} | Design system | https://www.figma.com/design/${DS}/ds | Read-only | Library |`,
].join('\n');

const NODE_HEADER = [
  '| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Approval Evidence | Last Verified |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
].join('\n');

function nodeRow(over = {}) {
  const r = {
    id: 'FIG-ADMIN-LOGIN-DESKTOP-DEFAULT',
    app: 'Admin',
    route: '/login',
    screen: 'Login',
    state: 'Default',
    vp: 'Desktop 1440',
    cls: 'high-fidelity',
    status: 'REVIEW_REQUIRED',
    key: PRODUCT,
    page: 'APP_01',
    node: '375:12',
    url: `[open](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=375-12)`,
    phase: 'APP1-D01',
    supersede: '—',
    evidence: '—',
    verified: '2026-07-25',
    ...over,
  };
  return `| ${r.id} | ${r.app} | ${r.route} | ${r.screen} | ${r.state} | ${r.vp} | ${r.cls} | ${r.status} | ${r.key} | ${r.page} | ${r.node} | ${r.url} | ${r.phase} | ${r.supersede} | ${r.evidence} | ${r.verified} |`;
}

function buildIndex(rows, { title = CANONICAL_TITLE, preamble = '' } = {}) {
  return `${title}\n${preamble}\n## Catalog\n\n${CATALOG}\n\n## Registry\n\n${NODE_HEADER}\n${rows.join('\n')}\n`;
}

function withFixture(body, plan) {
  const dir = mkdtempSync(join(tmpdir(), 'figidx-'));
  mkdirSync(join(dir, 'docs', 'design'), { recursive: true });
  writeFileSync(join(dir, INDEX_PATH), body);
  if (plan !== undefined) {
    mkdirSync(join(dir, 'docs', 'implementation', 'phases'), { recursive: true });
    writeFileSync(join(dir, PHASE_PLAN_PATH), plan);
  }
  return dir;
}

function run(body, plan) {
  const dir = withFixture(body, plan);
  try {
    return checkFigmaDesignIndex(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const has = (res, rule) => res.violations.some((v) => v.rule === rule);

test('valid index passes with no violations', () => {
  const res = run(
    buildIndex([
      nodeRow(),
      nodeRow({
        id: 'FIG-ADMIN-LOGIN-MOBILE-DEFAULT',
        vp: 'Mobile 390',
        node: '380:8',
        url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=380-8)`,
      }),
    ]),
  );
  assert.equal(res.violations.length, 0, JSON.stringify(res.violations));
  assert.equal(res.stats.registryIds, 2);
});

test('missing index file reports index-exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'figidx-empty-'));
  try {
    const res = checkFigmaDesignIndex(dir);
    assert.ok(has(res, 'index-exists'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('duplicate registry ID is rejected', () => {
  const res = run(buildIndex([nodeRow(), nodeRow({ node: '375:12' })]));
  assert.ok(has(res, 'registry-id-unique'));
});

test('invalid status is rejected', () => {
  const res = run(buildIndex([nodeRow({ status: 'DONE' })]));
  assert.ok(has(res, 'status'));
});

test('file-key mismatch between column and URL is rejected', () => {
  const res = run(
    buildIndex([nodeRow({ url: `[o](https://www.figma.com/design/${DS}/ds?node-id=375-12)` })]),
  );
  assert.ok(has(res, 'url-file-key'));
});

test('node-ID mismatch between column and URL is rejected', () => {
  const res = run(
    buildIndex([
      nodeRow({ url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=375-99)` }),
    ]),
  );
  assert.ok(has(res, 'url-node-id'));
});

test('file-level-only URL (no node-id) is rejected', () => {
  const res = run(
    buildIndex([nodeRow({ url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery)` })]),
  );
  assert.ok(has(res, 'deep-link'));
});

test('duplicate canonical composite key is rejected', () => {
  const res = run(
    buildIndex([
      nodeRow(),
      nodeRow({
        id: 'FIG-DUP',
        node: '999:1',
        url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=999-1)`,
      }),
    ]),
  );
  assert.ok(has(res, 'composite-unique'));
});

test('SUPERSEDED without replacement is rejected', () => {
  const res = run(buildIndex([nodeRow({ status: 'SUPERSEDED', supersede: '—' })]));
  assert.ok(has(res, 'supersede-ref'));
});

test('SUPERSEDED with a valid replacement passes that rule', () => {
  const rows = [
    nodeRow(),
    nodeRow({
      id: 'FIG-OLD',
      status: 'SUPERSEDED',
      state: 'Legacy',
      node: '10:1',
      url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=10-1)`,
      supersede: '→ FIG-ADMIN-LOGIN-DESKTOP-DEFAULT',
    }),
  ];
  const res = run(buildIndex(rows));
  assert.ok(!has(res, 'supersede-ref'), JSON.stringify(res.violations));
});

test('MISSING row with an invented link is rejected', () => {
  const res = run(
    buildIndex([
      nodeRow({
        id: 'FIG-MISS',
        status: 'MISSING',
        node: '5:5',
        url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=5-5)`,
      }),
    ]),
  );
  assert.ok(has(res, 'missing-no-link'));
});

test('MISSING row with empty node/link passes', () => {
  const res = run(
    buildIndex([
      nodeRow(),
      nodeRow({
        id: 'FIG-MISS',
        app: 'Storefront',
        route: '/404',
        screen: 'Not Found',
        status: 'MISSING',
        key: '—',
        page: '—',
        node: '',
        url: '—',
      }),
    ]),
  );
  assert.ok(!has(res, 'missing-no-link'));
  assert.ok(!has(res, 'node-fields'));
});

test('APPROVED row without evidence is rejected', () => {
  const res = run(buildIndex([nodeRow({ status: 'APPROVED', evidence: '' })]));
  assert.ok(has(res, 'approval-evidence'));
});

test('temporary t= tracker parameter is rejected', () => {
  const res = run(
    buildIndex([
      nodeRow({
        url: `[o](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=375-12&t=abc123-4)`,
      }),
    ]),
  );
  assert.ok(has(res, 'no-tracker-param'));
});

test('a personal email in the index is rejected', () => {
  const body = buildIndex([nodeRow()], { preamble: '\nContact someone@example.com\n' });
  assert.ok(body.includes('someone@example.com'));
  const res = run(body);
  assert.ok(has(res, 'no-secret'));
});

test('missing canonical file key in catalog is rejected', () => {
  const body = buildIndex([nodeRow()]).replace(
    `| FIG-FILE-DS | DS Core | ${DS} | Design system | https://www.figma.com/design/${DS}/ds | Read-only | Library |`,
    '',
  );
  const res = run(body);
  assert.ok(has(res, 'file-catalog'));
});

test('missing required column is rejected', () => {
  const brokenHeader =
    '| Registry ID | App/Library | Route/Capability | Screen/Asset | State | Viewport | Class | Status | File Key | Page | Node | Direct URL | Owning Phase | Supersedes/By | Last Verified |';
  const body = `${CANONICAL_TITLE}\n\n## Catalog\n\n${CATALOG}\n\n## Registry\n\n${brokenHeader}\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${nodeRow()}\n`;
  const res = run(body);
  assert.ok(has(res, 'required-columns'));
});

test('valid APP1 phase references resolve', () => {
  const plan = 'APP1-D01 delivers FIG-ADMIN-LOGIN-DESKTOP-DEFAULT and FIG-FILE-PRODUCT.';
  const res = run(buildIndex([nodeRow()]), plan);
  assert.ok(!has(res, 'phase-ref'), JSON.stringify(res.violations));
});

test('unknown APP1 phase reference is rejected', () => {
  const plan = 'APP1-D01 references FIG-DOES-NOT-EXIST.';
  const res = run(buildIndex([nodeRow()]), plan);
  assert.ok(has(res, 'phase-ref'));
});

// --- APP2-A03-G01-C1: document-structure and named-authority regressions ---

const PRODUCT_FORM_URL = (node) =>
  `[open](https://www.figma.com/design/${PRODUCT}/embroidery?node-id=${node.replace(':', '-')})`;

/** A canonical, promoted A03 authority row. */
function a03Row(spec, over = {}) {
  return nodeRow({
    id: spec.id,
    route: 'Product form',
    screen: 'Product Form',
    state: 'Edit/Detail — Default',
    node: spec.node,
    url: PRODUCT_FORM_URL(spec.node),
    status: 'APPROVED_FOR_IMPLEMENTATION',
    phase: 'APP2-D01',
    evidence: A03_APPROVAL_EVIDENCE,
    ...over,
  });
}

/** All five A03 rows, each distinct on the canonical composite key. */
function a03Rows(overById = {}) {
  return A03_REQUIRED_ROWS.map((spec, i) =>
    a03Row(spec, { state: `Edit/Detail — S${i}`, ...(overById[spec.id] ?? {}) }),
  );
}

test('canonical title is required as the first nonblank line', () => {
  const res = run(buildIndex([nodeRow()], { title: '# Some Other Title' }));
  assert.ok(has(res, 'document-title'), JSON.stringify(res.violations));
});

test('a UTF-8 BOM before the canonical title is tolerated', () => {
  const res = run(`\uFEFF${buildIndex([nodeRow()])}`);
  assert.ok(!has(res, 'document-title'), JSON.stringify(res.violations));
});

test('the actual APP2-A03-G01 corruption is rejected', () => {
  // Reproduces the committed defect exactly: five promoted rows concatenated with
  // "||" and spliced onto the title, while the canonical rows stay REVIEW_REQUIRED.
  // Each row already ends with "|" and the next begins with "|", so joining with ''
  // yields the exact "… 2026-07-31 || FIG-…" shape that was committed.
  const promoted = a03Rows()
    .map((r) => r.trim())
    .join('');
  const canonical = a03Rows(
    Object.fromEntries(
      A03_REQUIRED_ROWS.map((s) => [s.id, { status: 'REVIEW_REQUIRED', evidence: '—' }]),
    ),
  );
  const body = buildIndex(canonical, { title: `${promoted}${CANONICAL_TITLE}` });

  const res = run(body);
  assert.ok(has(res, 'document-title'), 'spliced title must be rejected');
  assert.ok(has(res, 'row-placement'), 'rows outside a table must be rejected');
  assert.ok(has(res, 'a03-approval'), 'unapproved A03 authority must be rejected');
  const spliced = res.violations.find((v) => v.rule === 'document-title');
  assert.match(spliced.message, /spliced onto the title line/);
});

test('a registry row before the title is rejected even with a valid title line', () => {
  const body = `${nodeRow()}\n${buildIndex([nodeRow({ id: 'FIG-ADMIN-OTHER' })])}`;
  const res = run(body);
  assert.ok(has(res, 'row-placement'), JSON.stringify(res.violations));
});

test('a registry row after the title but outside any table is rejected', () => {
  const body = buildIndex([nodeRow()], { preamble: `\n${nodeRow({ id: 'FIG-STRAY-ROW' })}\n` });
  const res = run(body);
  assert.ok(has(res, 'row-placement'), JSON.stringify(res.violations));
});

test('prose mentioning a registry ID in backticks is allowed', () => {
  const body = buildIndex(a03Rows(), {
    preamble: '\nThe row `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT` is approved; see | notes.\n',
  });
  const res = run(body);
  assert.ok(!has(res, 'row-placement'), JSON.stringify(res.violations));
});

test('a clean promoted A03 registry passes', () => {
  const res = run(buildIndex(a03Rows()));
  assert.equal(res.violations.length, 0, JSON.stringify(res.violations));
});

test('reverting one A03 row to REVIEW_REQUIRED is rejected', () => {
  const target = A03_REQUIRED_ROWS[2].id;
  const res = run(buildIndex(a03Rows({ [target]: { status: 'REVIEW_REQUIRED' } })));
  assert.ok(has(res, 'a03-approval'), JSON.stringify(res.violations));
  assert.match(res.violations.find((v) => v.rule === 'a03-approval').message, /APPROVED_FOR_IMPL/);
});

test('an A03 row with the wrong approval evidence is rejected', () => {
  const target = A03_REQUIRED_ROWS[0].id;
  const res = run(buildIndex(a03Rows({ [target]: { evidence: 'FIG-APPROVAL-SOMETHING-ELSE' } })));
  assert.ok(has(res, 'a03-approval'), JSON.stringify(res.violations));
});

test('an A03 row pointing at the wrong node is rejected', () => {
  const target = A03_REQUIRED_ROWS[1].id;
  const res = run(buildIndex(a03Rows({ [target]: { node: '999:999' } })));
  assert.ok(has(res, 'a03-approval'), JSON.stringify(res.violations));
});

test('a missing A03 authority row is rejected', () => {
  const rows = a03Rows().slice(1);
  const res = run(buildIndex(rows));
  assert.ok(has(res, 'a03-approval'), JSON.stringify(res.violations));
  assert.match(res.violations.find((v) => v.rule === 'a03-approval').message, /is missing/);
});

test('registries with no A03 authority are unaffected', () => {
  const res = run(buildIndex([nodeRow()]));
  assert.ok(!has(res, 'a03-approval'), JSON.stringify(res.violations));
});
