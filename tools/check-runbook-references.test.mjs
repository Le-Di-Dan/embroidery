/**
 * Focused tests for `check-runbook-references.mjs` (`APP12-H07`).
 *
 * A gate nobody has proved wrong is a gate nobody should trust: the failure
 * mode of a checker is *passing* when it should not, and that failure is
 * invisible against a healthy repository. So every test here builds a small
 * throwaway tree with a **specific defect in it** and asserts the finding, then
 * one asserts the real repository passes.
 *
 * Closes the convention half of `FU-APP12-H02-02`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  REPO_ROOT,
  alertRunbookIds,
  check,
  citedNodeTools,
  citedPaths,
  citedPnpmScripts,
  headingSlugs,
  markdownLinks,
  slugify,
  stripFencedBlocks,
} from './check-runbook-references.mjs';

/* ------------------------------------------------------------------ */
/* The parsing primitives                                              */
/* ------------------------------------------------------------------ */

test('slugify follows the heading-anchor rules these documents rely on', () => {
  assert.equal(slugify('1. RUNBOOK-H07-API-DOWN'), '1-runbook-h07-api-down');
  assert.equal(slugify('0. The one rule'), '0-the-one-rule');
  assert.equal(slugify('Expected state'), 'expected-state');
  assert.equal(slugify('`RB-01` section 7'), 'rb-01-section-7');
  // An em dash is removed and leaves the two spaces around it as two hyphens,
  // which is exactly what GitHub does and what the index links depend on.
  assert.equal(slugify('2. The gap — read this'), '2-the-gap--read-this');
});

test('headingSlugs collects every level and nothing else', () => {
  const slugs = headingSlugs(['# One', 'body', '### Three deep', 'not # a heading'].join('\n'));
  assert.ok(slugs.has('one'));
  assert.ok(slugs.has('three-deep'));
  assert.equal(slugs.size, 2);
});

test('stripFencedBlocks removes examples so they are not read as citations', () => {
  const stripped = stripFencedBlocks(
    ['before', '```sh', '`apps/nope/x.ts`', '```', 'after'].join('\n'),
  );
  assert.ok(!stripped.includes('apps/nope'));
  assert.ok(stripped.includes('before') && stripped.includes('after'));
});

test('alertRunbookIds reads the runbook annotation and not the surrounding prose', () => {
  const ids = alertRunbookIds(
    [
      '        dashboard: Wave 1',
      '          runbook: RUNBOOK-H07-API-DOWN',
      '# runbook: RUNBOOK-H07-FAKE',
    ].join('\n'),
  );
  assert.deepEqual([...ids], ['RUNBOOK-H07-API-DOWN']);
});

test('markdownLinks keeps relative targets and drops absolute ones', () => {
  const links = markdownLinks(
    '[a](RB-01-DEPLOYMENT.md) [b](README.md#0-the-one-rule) [c](https://example.com)',
  );
  assert.deepEqual(links, [
    { target: 'RB-01-DEPLOYMENT.md', anchor: undefined },
    { target: 'README.md', anchor: '0-the-one-rule' },
  ]);
});

test('a same-document link resolves to the document it is written in', () => {
  // `](#heading)` is ordinary markdown. Parsed naively it looks like a file
  // named `#heading`, which is how this checker first reported a false finding
  // against its own runbooks.
  assert.deepEqual(markdownLinks('see [that](#the-heading)'), [
    { target: '', anchor: 'the-heading' },
  ]);
});

test('a same-document anchor is checked against the same document', () => {
  withScaffold(
    {
      'README.md':
        '# Index\nRUNBOOK-H07-API-DOWN\n\n## Real heading\n[ok](#real-heading) [bad](#absent-heading)\n',
    },
    {},
    (findings) => {
      assert.equal(findings.length, 1);
      assert.equal(findings[0].kind, 'LINK');
      assert.match(findings[0].detail, /#absent-heading/);
    },
  );
});

test('citedPaths ignores placeholders, globs and non-repository tokens', () => {
  const paths = citedPaths(
    [
      '`tools/db-backup.mjs` is real.',
      '`packages/database/migrations/*.sql` is a glob.',
      '`<operator-owned file>` is a placeholder.',
      '`kubectl apply` is a command, not a path.',
    ].join('\n'),
  );
  assert.deepEqual([...paths], ['tools/db-backup.mjs']);
});

test('citedNodeTools and citedPnpmScripts read invocations from code blocks too', () => {
  const body = [
    '```sh',
    'node tools/check-release-config.mjs production',
    'pnpm db:backup --database x',
    'pnpm --filter @embroidery/api openapi:check',
    'pnpm install',
    '```',
  ].join('\n');
  assert.deepEqual([...citedNodeTools(body)], ['tools/check-release-config.mjs']);
  assert.deepEqual(citedPnpmScripts(body), [
    { workspace: undefined, script: 'db:backup' },
    { workspace: '@embroidery/api', script: 'openapi:check' },
  ]);
});

/* ------------------------------------------------------------------ */
/* The gate, against trees built to fail                               */
/* ------------------------------------------------------------------ */

/** A minimal repository shaped like the real one, plus whatever the test adds. */
function scaffold(documents, { runbookId = 'RUNBOOK-H07-API-DOWN' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'runbook-refs-'));
  mkdirSync(join(root, 'docs', 'operations'), { recursive: true });
  mkdirSync(join(root, 'infrastructure', 'monitoring', 'prometheus', 'rules'), { recursive: true });
  mkdirSync(join(root, 'tools'), { recursive: true });
  mkdirSync(join(root, 'apps', 'api'), { recursive: true });

  writeFileSync(
    join(root, 'infrastructure/monitoring/prometheus/rules/wave1-commerce.rules.yml'),
    `      - alert: X\n        annotations:\n          runbook: ${runbookId}\n`,
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'db:backup': 'x' } }));
  writeFileSync(
    join(root, 'apps/api/package.json'),
    JSON.stringify({ name: '@embroidery/api', scripts: { 'openapi:check': 'x' } }),
  );
  writeFileSync(join(root, 'tools/real-tool.mjs'), '');

  for (const [name, body] of Object.entries(documents)) {
    writeFileSync(join(root, 'docs', 'operations', name), body);
  }
  return root;
}

function withScaffold(documents, options, assertions) {
  const root = scaffold(documents, options);
  try {
    assertions(check(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('an alert runbook id absent from the index is reported', () => {
  withScaffold({ 'README.md': '# Index\n' }, { runbookId: 'RUNBOOK-H07-ORPHAN' }, (findings) => {
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'ALERT');
    assert.match(findings[0].detail, /RUNBOOK-H07-ORPHAN/);
  });
});

test('an alert runbook id present in the index passes', () => {
  withScaffold({ 'README.md': '# Index\n`RUNBOOK-H07-API-DOWN`\n' }, {}, (findings) => {
    assert.deepEqual(findings, []);
  });
});

test('a link to a document that does not exist is reported', () => {
  withScaffold(
    { 'README.md': '# Index\nRUNBOOK-H07-API-DOWN\n[gone](RB-99-NOPE.md)\n' },
    {},
    (findings) => {
      assert.equal(findings.length, 1);
      assert.equal(findings[0].kind, 'LINK');
      assert.match(findings[0].detail, /RB-99-NOPE\.md does not exist/);
    },
  );
});

test('a link to a heading that does not exist is reported, and a real one is not', () => {
  withScaffold(
    {
      'README.md':
        '# Index\nRUNBOOK-H07-API-DOWN\n[bad](RB-01.md#no-such-heading)\n[good](RB-01.md#real-heading)\n',
      'RB-01.md': '# RB-01\n\n## Real heading\n',
    },
    {},
    (findings) => {
      assert.equal(findings.length, 1);
      assert.equal(findings[0].kind, 'LINK');
      assert.match(findings[0].detail, /#no-such-heading/);
    },
  );
});

test('a cited repository path that does not exist is reported', () => {
  withScaffold(
    { 'README.md': '# Index\nRUNBOOK-H07-API-DOWN\nSee `apps/api/does-not-exist.ts`.\n' },
    {},
    (findings) => {
      assert.equal(findings.length, 1);
      assert.equal(findings[0].kind, 'PATH');
    },
  );
});

test('a node tool that does not exist is reported, and a real one is not', () => {
  withScaffold(
    {
      'README.md': [
        '# Index',
        'RUNBOOK-H07-API-DOWN',
        '```sh',
        'node tools/real-tool.mjs',
        'node tools/imaginary-tool.mjs',
        '```',
      ].join('\n'),
    },
    {},
    (findings) => {
      assert.equal(findings.length, 1);
      assert.equal(findings[0].kind, 'COMMAND');
      assert.match(findings[0].detail, /imaginary-tool/);
    },
  );
});

test('a pnpm script that is not declared is reported, for the root and for a workspace', () => {
  withScaffold(
    {
      'README.md': [
        '# Index',
        'RUNBOOK-H07-API-DOWN',
        '```sh',
        'pnpm db:backup',
        'pnpm db:not-a-script',
        'pnpm --filter @embroidery/api openapi:check',
        'pnpm --filter @embroidery/nope build',
        '```',
      ].join('\n'),
    },
    {},
    (findings) => {
      assert.equal(findings.length, 2);
      assert.ok(findings.every((finding) => finding.kind === 'COMMAND'));
      assert.match(findings[0].detail, /db:not-a-script/);
      assert.match(findings[1].detail, /@embroidery\/nope names no workspace/);
    },
  );
});

test('an empty operations directory is reported rather than passing silently', () => {
  withScaffold({}, {}, (findings) => {
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'SETUP');
  });
});

/* ------------------------------------------------------------------ */
/* The repository itself                                               */
/* ------------------------------------------------------------------ */

test('the delivered runbooks pass the gate', () => {
  assert.deepEqual(check(REPO_ROOT), []);
});
