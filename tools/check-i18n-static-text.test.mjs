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

describe('the ASCII escape rule 4 closes (APP12-V02-C1 §3)', () => {
  // The Product Owner's own four fixtures. Each is ASCII, so rule 3 cannot see
  // it; each is an identifier rather than JSX text, so rules 1 and 2 cannot
  // either; and each is read by whoever opens the screen.

  it('flags a constant painted as a JSX child', () => {
    const source = [
      'const LABEL = "Order";',
      'export function A() { return <button>{LABEL}</button>; }',
    ].join('\n');
    assert.deepEqual(rules(source), ['jsx-child-copy']);
    assert.equal(scan(source)[0].text, 'Order');
  });

  it('flags an empty-state sentence parked in a constant', () => {
    const source = [
      'const EMPTY_STATE = "No orders";',
      'export function A() { return <p>{EMPTY_STATE}</p>; }',
    ].join('\n');
    assert.deepEqual(rules(source), ['jsx-child-copy']);
    assert.equal(scan(source)[0].text, 'No orders');
  });

  it('flags an accessible name parked in a constant', () => {
    const source = [
      'const SR_LABEL = "Close dialog";',
      'export function A() { return <button aria-label={SR_LABEL} />; }',
    ].join('\n');
    assert.deepEqual(rules(source), ['jsx-attribute-copy:aria-label']);
    assert.equal(scan(source)[0].text, 'Close dialog');
  });

  it('flags copy reached through an object property', () => {
    const source = [
      'const COPY = {',
      '  title: "Payment",',
      '  helper: "Check the transfer"',
      '};',
      'export function A() { return <section>{COPY.title}</section>; }',
    ].join('\n');
    assert.deepEqual(rules(source), ['jsx-child-copy']);
    assert.equal(scan(source)[0].text, 'Payment');
  });

  it('flags copy reached through destructuring, which is how the catalogs are read', () => {
    const source = [
      'const COPY = { brand: { title: "Workshop admin" } };',
      'export function A() {',
      '  const { brand } = COPY;',
      '  return <p>{brand.title}</p>;',
      '}',
    ].join('\n');
    assert.deepEqual(rules(source), ['jsx-child-copy']);
    assert.equal(scan(source)[0].text, 'Workshop admin');
  });

  it('flags either branch of a conditional', () => {
    const source = [
      'const OPEN_LABEL = "Open";',
      'const SHUT_LABEL = "Closed";',
      'export function A({ open }) { return <span>{open ? OPEN_LABEL : SHUT_LABEL}</span>; }',
    ].join('\n');
    assert.equal(scan(source).length, 2);
  });

  it('reports the literal, not the render site, so the fix is where the string is', () => {
    const source = [
      'const LABEL = "Order";',
      '',
      'export function A() { return <button>{LABEL}</button>; }',
    ].join('\n');
    assert.equal(scan(source)[0].line, 1);
  });

  it('still stops at a call, which is how every real sentence arrives', () => {
    const source = [
      "const copy = message.text('orders.title');",
      'export function A() { return <h1>{copy}</h1>; }',
    ].join('\n');
    assert.deepEqual(scan(source), []);
  });

  it('does not flag technical values that merely pass through a rendering position', () => {
    // Every one of these reaches a JSX child or a human-facing attribute, and
    // none of them is copy: a route the link paints, a dynamic order code, an
    // ISO timestamp, a class name and a test id. Rule 4 reports the *literal*
    // behind a rendered value, and there is no literal behind any of these.
    const source = [
      'export function A({ order }) {',
      '  return (',
      '    <div className="order" data-testid="order-row">',
      '      <a href="/don-hang">{order.code}</a>',
      '      <time dateTime={order.placedAt}>{order.placedAtLabel}</time>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    assert.deepEqual(scan(source), []);
  });

  it('does not flag a technical constant that never reaches a rendering position', () => {
    const source = [
      "const ROUTE = '/quan-tri/don-hang';",
      "const TESTID = 'order-row';",
      "const MIME = 'image/webp';",
      "const OP = 'adminOrderRead';",
      "const METHOD = 'PATCH';",
      "const KEY = 'orders.title';",
      'export function A() { return <a href={ROUTE} data-testid={TESTID} />; }',
    ].join('\n');
    assert.deepEqual(scan(source), []);
  });

  it('honours the escape hatch on the literal, not only on the render site', () => {
    const source = [
      'const UNIT = "px"; // i18n-exempt: CSS unit rendered beside a numeric input',
      'export function A() { return <span>{UNIT}</span>; }',
    ].join('\n');
    assert.deepEqual(scan(source), []);
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
