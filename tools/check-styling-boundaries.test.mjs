/**
 * Verification for tools/check-styling-boundaries.mjs using node:test (no extra
 * dependencies). Run from the repository root:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkStylingBoundaries } from './check-styling-boundaries.mjs';

function makeFile(root, relativePath, content) {
  const fullPath = join(root, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
}

function withRepo(callback) {
  const root = mkdtempSync(join(tmpdir(), 'styling-check-'));
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// A minimal, compliant frontend app.
function makeCleanApp(root, app = 'web') {
  makeFile(root, `apps/${app}/next.config.ts`, 'export default {};\n');
  makeFile(root, `apps/${app}/package.json`, JSON.stringify({ name: app, dependencies: {} }));
  makeFile(root, `apps/${app}/src/styles/main.scss`, "@use '@embroidery/styles' as styles;\n");
  makeFile(
    root,
    `apps/${app}/src/app/layout.tsx`,
    "import '../styles/main.scss';\nexport default function L() { return null; }\n",
  );
}

function rules(result) {
  return result.violations.map((v) => v.rule);
}

test('passes for a compliant app', () => {
  withRepo((root) => {
    makeCleanApp(root);
    const result = checkStylingBoundaries(root);
    assert.equal(result.violations.length, 0, JSON.stringify(result.violations));
    assert.equal(result.appsChecked, 1);
  });
});

test('flags CSS Modules', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(root, 'apps/web/src/app/thing.module.scss', '.a { color: red; }\n');
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-css-modules'));
  });
});

test('flags Sass @import', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(root, 'apps/web/src/styles/extra.scss', "@import 'x';\n");
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-sass-import'));
  });
});

test('flags a Tailwind dependency', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(
      root,
      'apps/web/package.json',
      JSON.stringify({ name: 'web', devDependencies: { tailwindcss: '^3' } }),
    );
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-tailwind'));
  });
});

test('flags a CSS-in-JS dependency', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(
      root,
      'apps/web/package.json',
      JSON.stringify({ name: 'web', dependencies: { '@emotion/react': '^11' } }),
    );
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-css-in-js'));
  });
});

test('flags an inline JSX style prop but not object properties', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(
      root,
      'apps/web/src/app/page.tsx',
      'export const P = () => <div style={{ color: "red" }} />;\n',
    );
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-inline-style-prop'));
  });
  withRepo((root) => {
    makeCleanApp(root);
    // `style:` object property and `.style` member access must not be flagged.
    makeFile(root, 'apps/web/src/app/data.ts', 'const o = { style: 1 };\nconst s = el.style;\n');
    assert.ok(!rules(checkStylingBoundaries(root)).includes('no-inline-style-prop'));
  });
});

test('flags app-local token duplication but not namespaced usage', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(root, 'apps/web/src/styles/tokens.scss', '$color-brand: #e8475f;\n');
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-app-local-token-duplication'));
  });
  withRepo((root) => {
    makeCleanApp(root);
    // Namespaced consumption is fine.
    makeFile(
      root,
      'apps/web/src/styles/main.scss',
      "@use '@embroidery/styles' as s;\nbody { color: s.$color-text-primary; }\n",
    );
    assert.ok(!rules(checkStylingBoundaries(root)).includes('no-app-local-token-duplication'));
  });
});

test('flags a deep import of shared package internals', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(
      root,
      'apps/web/src/styles/main.scss',
      "@use '@embroidery/styles/src/settings/color';\n",
    );
    assert.ok(rules(checkStylingBoundaries(root)).includes('no-shared-package-internal-import'));
  });
});

test('flags a global style import outside the root layout', () => {
  withRepo((root) => {
    makeCleanApp(root);
    makeFile(
      root,
      'apps/web/src/app/page.tsx',
      "import '../styles/main.scss';\nexport default function P() { return null; }\n",
    );
    assert.ok(
      rules(checkStylingBoundaries(root)).includes('global-style-import-in-root-layout-only'),
    );
  });
});

test('flags main.scss at a non-canonical path', () => {
  withRepo((root) => {
    makeFile(root, 'apps/web/next.config.ts', 'export default {};\n');
    makeFile(root, 'apps/web/package.json', JSON.stringify({ name: 'web' }));
    makeFile(root, 'apps/web/src/app/main.scss', "@use '@embroidery/styles';\n");
    makeFile(
      root,
      'apps/web/src/app/layout.tsx',
      "import './main.scss';\nexport default function L() { return null; }\n",
    );
    assert.ok(rules(checkStylingBoundaries(root)).includes('canonical-main-path'));
  });
});
