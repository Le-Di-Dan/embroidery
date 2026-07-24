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

function buildIndex(rows) {
  return `# Figma Design Index\n\n## Catalog\n\n${CATALOG}\n\n## Registry\n\n${NODE_HEADER}\n${rows.join('\n')}\n`;
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
  const body = buildIndex([nodeRow()]).replace(
    '# Figma Design Index',
    '# Figma Design Index\n\nContact someone@example.com',
  );
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
  const body = `# Figma Design Index\n\n## Catalog\n\n${CATALOG}\n\n## Registry\n\n${brokenHeader}\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${nodeRow()}\n`;
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
