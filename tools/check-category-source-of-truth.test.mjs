/**
 * Tests for the category source-of-truth gate (`APP12-C01-C1`).
 *
 * A gate that cannot fail is not a gate. These run `inspectFile` against
 * synthetic sources — no real file is read and no fixture directory is created —
 * and pin both halves of its judgement: the shapes a compiled taxonomy actually
 * takes, and the shapes that merely mention a category and must stay legal.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BANNED_IMPORT_FRAGMENTS,
  BANNED_SYMBOLS,
  inspectFile,
  LIST_THRESHOLD,
  withoutComments,
} from './check-category-source-of-truth.mjs';

const FILE = 'apps/storefront/src/features/product-discovery/model/example.ts';

describe('a compiled category taxonomy is refused', () => {
  it('fails an array of historical slugs', () => {
    const violations = inspectFile(
      FILE,
      `export const SLUGS = ['thu-bong', 'khan', 'quan-ao', 'khac'] as const;`,
    );

    assert.equal(violations.length, 1);
    assert.match(violations[0], /compiled taxonomy/);
  });

  it('fails a slug-to-label map, on both the slugs and the labels', () => {
    const violations = inspectFile(FILE, `const LABEL = { 'thu-bong': 'Thú bông', khan: 'Khăn' };`);

    // The keys are quoted only when they need to be, so the slug half may match
    // once; the label half is always quoted. Either alone is a failure.
    assert.ok(violations.some((message) => /category labels/.test(message)));
  });

  it('fails a label list even when no slug appears', () => {
    const violations = inspectFile(FILE, `const LABELS = ['Thú bông', 'Quần áo', 'Khác'];`);

    assert.equal(violations.length, 1);
    assert.match(violations[0], /a category's name is data/);
  });

  it('fails a switch over historical slugs', () => {
    const violations = inspectFile(
      FILE,
      `switch (slug) { case 'thu-bong': return 1; case 'khan': return 2; default: return 0; }`,
    );

    assert.ok(violations.some((message) => /compiled taxonomy/.test(message)));
  });

  for (const fragment of BANNED_IMPORT_FRAGMENTS) {
    it(`fails an import of ${fragment}`, () => {
      const violations = inspectFile(FILE, `import { X } from '../model/${fragment}x';`);

      assert.ok(violations.length >= 1);
      assert.ok(violations.every((message) => /test-only data/.test(message)));
    });
  }

  for (const symbol of BANNED_SYMBOLS) {
    it(`fails a reference to ${symbol}`, () => {
      const violations = inspectFile(FILE, `const values = ${symbol};`);

      assert.ok(violations.some((message) => message.includes(symbol)));
    });
  }

  it('fails a dynamic import of the historical fixture', () => {
    const violations = inspectFile(
      FILE,
      `const mod = await import('../schema/catalog/__historical__/app2-category-fixture');`,
    );

    assert.ok(violations.length >= 1);
  });
});

describe('mentioning a category is not owning one', () => {
  it('passes a single slug used as an example', () => {
    assert.deepEqual(
      inspectFile(FILE, `const EXAMPLE_SLUG = 'thu-bong';`),
      [],
      'one value is an illustration, not a list',
    );
  });

  it('passes prose that names every historical category', () => {
    const source = `/**
 * The taxonomy used to be compiled in: thu-bong, khan, quan-ao, khac — with
 * labels Thú bông, Khăn, Quần áo and Khác. It is data now.
 */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;`;

    assert.deepEqual(
      inspectFile(FILE, source),
      [],
      'the correction is documented in prose that names them; comments are not code',
    );
  });

  it('passes a line comment naming two slugs', () => {
    assert.deepEqual(inspectFile(FILE, `// e.g. thu-bong or khan\nconst x = 1;`), []);
  });

  it('passes the slug shape rule, which is code owning a rule not a value', () => {
    const source = `export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isCategorySlugShape(value) {
  return CATEGORY_SLUG_PATTERN.test(value);
}`;

    assert.deepEqual(inspectFile(FILE, source), []);
  });

  it('passes arbitrary non-historical category values', () => {
    // Fixture and example values are not the historical taxonomy and are not
    // what the gate is about.
    assert.deepEqual(
      inspectFile(FILE, `const FIXTURE = ['mu-luoi-trai', 'tui-vai', 'ao-khoac'];`),
      [],
    );
  });

  it('passes a status vocabulary, which code does own', () => {
    assert.deepEqual(inspectFile(FILE, `const STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];`), []);
  });
});

describe('the threshold', () => {
  it('is two, so one value never fails and two always do', () => {
    assert.equal(LIST_THRESHOLD, 2);
    assert.deepEqual(inspectFile(FILE, `const a = 'khan';`), []);
    assert.equal(inspectFile(FILE, `const a = ['khan', 'khac'];`).length, 1);
  });
});

describe('comment stripping', () => {
  it('removes block and line comments and keeps the code', () => {
    const stripped = withoutComments(`/* thu-bong */ const a = 1; // khan\nconst b = 2;`);

    assert.ok(!stripped.includes('thu-bong'));
    assert.ok(!stripped.includes('khan'));
    assert.ok(stripped.includes('const a = 1;'));
    assert.ok(stripped.includes('const b = 2;'));
  });
});
