/**
 * Focused tests for the hard-coded static-text gate (`APP12-V02` §5A.11).
 *
 * The gate's value is almost entirely in what it does **not** flag. §5A.11
 * forbids a naive text search precisely because this repository is full of
 * strings a regular expression would mistake for copy — route paths, CSS class
 * names, business-state enum values, operation ids, test ids, MIME types — and
 * a checker that reports those is a checker somebody turns off. So most of what
 * follows is negative, and each negative case is a real shape taken from the
 * source rather than an invented one.
 *
 * The gate is driven on source strings rather than on the repository, so these
 * tests state its rules rather than the current state of the code.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import {
  EXEMPT_COMMENT,
  HUMAN_FACING_ATTRIBUTES,
  findStaticText,
} from './check-i18n-static-text.mjs';

const require = createRequire(import.meta.url);
const ts = require('../apps/storefront/node_modules/typescript/lib/typescript.js');

function scan(source, file = 'sample.tsx') {
  return findStaticText(ts, file, source);
}

function rules(source, file) {
  return scan(source, file).map((item) => item.rule);
}

describe('what the gate flags', () => {
  it('flags a Vietnamese sentence written into a module', () => {
    const found = scan(`export const COPY = { title: 'Đơn hàng của bạn' };`, 'sample.ts');
    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'vietnamese-literal');
    assert.equal(found[0].text, 'Đơn hàng của bạn');
  });

  it('flags text painted directly between JSX tags, in any language', () => {
    // JSX text *is* the rendering path, so English here is a defect of a
    // different kind but exactly the same shape.
    assert.deepEqual(rules(`export function A() { return <p>Order status</p>; }`), ['jsx-text']);
  });

  it('flags an accessible name, which §5A.12 does not exempt for being invisible', () => {
    for (const attribute of ['aria-label', 'alt', 'title', 'placeholder']) {
      const found = rules(`export function A() { return <input ${attribute}="Số điện thoại" />; }`);
      assert.ok(
        found.includes(`jsx-attribute:${attribute}`),
        `${attribute} should be checked, got ${JSON.stringify(found)}`,
      );
    }
  });

  it('flags an accessible name passed through an expression container', () => {
    const found = rules(`export function A() { return <img alt={'Ảnh sản phẩm'} />; }`);
    assert.ok(found.includes('jsx-attribute:alt'));
  });

  it('flags a Vietnamese fragment inside a template literal', () => {
    assert.deepEqual(rules('export const t = (n) => `Còn ${n} sản phẩm`;', 'sample.ts'), [
      'vietnamese-literal',
    ]);
  });

  it('reports a location a developer can jump to', () => {
    const found = scan(`const a = 1;\nconst b = 'Đã giao';\n`, 'sample.ts');
    assert.equal(found[0].line, 2);
    assert.ok(found[0].column > 0);
  });
});

describe('what the gate must not flag', () => {
  it('ignores a route path', () => {
    assert.deepEqual(scan(`export const ROUTE = '/truy-cap/don-hang';`, 'sample.ts'), []);
  });

  it('ignores a slug, a CSS class and a test id', () => {
    const source = `
      export const A = { slug: 'chinh-sach-giao-hang' };
      export function B() {
        return <div className="order-card__row" data-testid="order-code" />;
      }
    `;
    assert.deepEqual(scan(source), []);
  });

  it('ignores business-state and error-code enum values', () => {
    const source = `
      export const STATES = ['AWAITING_SHIPPING_FEE', 'READY_FOR_DELIVERY'];
      export const CODE = 'FULL_PAYMENT_NOT_PAYABLE';
    `;
    assert.deepEqual(scan(source, 'sample.ts'), []);
  });

  it('ignores an operation id, a MIME type and a query key', () => {
    const source = `
      export const OP = 'publicReadyMadeOrderCreate';
      export const MIME = 'image/webp';
      export const KEY = ['orders', 'detail'];
    `;
    assert.deepEqual(scan(source, 'sample.ts'), []);
  });

  it('ignores prose in a comment, where the catalogs document their keys', () => {
    const source = `
      /** \`910:336\` — the access-expiry note. Bản tiếng Việt nằm trong JSON. */
      // Cũng là một chú thích tiếng Việt.
      export const A = { note: message.text('access.note') };
    `;
    assert.deepEqual(scan(source, 'sample.ts'), []);
  });

  it('ignores JSX whitespace, punctuation and interpolation', () => {
    const source = `export function A() { return <p> · {value} — {other}</p>; }`;
    assert.deepEqual(scan(source), []);
  });

  it('ignores a machine-valued attribute that happens to read like words', () => {
    const source = `export function A() { return <a href="/cua-hang" id="store-link" />; }`;
    assert.deepEqual(scan(source), []);
    assert.equal(HUMAN_FACING_ATTRIBUTES.has('href'), false);
    assert.equal(HUMAN_FACING_ATTRIBUTES.has('id'), false);
  });
});

describe('the escape hatch', () => {
  it('honours an inline exemption that carries a reason', () => {
    const source =
      `export const SYMBOL = '·'; // i18n-exempt: presentational separator\n` +
      `export const B = 'Đã giao'; // i18n-exempt: fixture-only\n`;
    assert.deepEqual(scan(source, 'sample.ts'), []);
  });

  it('requires a reason, so a bare marker cannot silence the gate', () => {
    const source = `export const B = 'Đã giao'; // i18n-exempt:\n`;
    assert.equal(scan(source, 'sample.ts').length, 1);
    assert.equal(EXEMPT_COMMENT.test('// i18n-exempt:'), false);
    assert.equal(EXEMPT_COMMENT.test('// i18n-exempt: why'), true);
  });
});
