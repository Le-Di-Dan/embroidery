/**
 * Focused tests for the message-key integrity gate (`APP12-V02` §5A.13).
 *
 * Two failure modes are being guarded, and both are silent in production:
 * a key a component reads but the repository does not hold (the page renders
 * `orders.orderAccess.qr.hint` where a sentence belongs), and a key the
 * repository holds but nothing reads (a Product Owner edits it, nothing
 * changes, and the repository stops being trusted).
 *
 * The key-resolution half is tested against source strings so the rules are
 * stated rather than inferred. The final case runs the real gate over the real
 * repository, because "the shipped state is clean" is a claim only that can
 * make.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { flattenKeys, readsOf, run } from './check-i18n-message-keys.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('flattening a message tree', () => {
  it('addresses every leaf by its dotted path, and every catalog above it', () => {
    // The sub-object is addressable too: `group('hero')` takes a whole catalog
    // at once, which is how an enum-keyed label set is read. Omitting it made
    // every key under such a catalog look like an orphan.
    const keys = flattenKeys({ hero: { heading: 'a', lead: 'b' }, action: 'c' });
    assert.deepEqual(keys.sort(), ['action', 'hero', 'hero.heading', 'hero.lead']);
  });

  it('addresses a list both as a whole and per index', () => {
    // `list('paragraphs')` and `text('paragraphs.0')` are both legal reads, so
    // both have to resolve or one of them would be reported as missing.
    const keys = flattenKeys({ paragraphs: ['a', 'b'] });
    assert.deepEqual(keys.sort(), ['paragraphs', 'paragraphs.0', 'paragraphs.1']);
  });

  it('descends into a list of objects', () => {
    const keys = flattenKeys({ steps: [{ title: 'a' }, { title: 'b' }] });
    assert.ok(keys.includes('steps.0.title'));
    assert.ok(keys.includes('steps.1.title'));
  });
});

describe('resolving what a file reads', () => {
  it('joins a view prefix to the key at the call site', () => {
    const { reads } = readsOf(
      `const homepageMessage = messageView(VI_MESSAGES.storefront, 'homepage');\n` +
        `const A = { h: homepageMessage.text('hero.heading') };\n`,
    );
    assert.deepEqual(reads, [{ namespace: 'storefront', key: 'homepage.hero.heading' }]);
  });

  it('resolves a hyphenated namespace from its camel-cased export', () => {
    const { reads } = readsOf(
      `const queueMessage = messageView(VI_MESSAGES.adminOrders, 'queue');\n` +
        `const A = queueMessage.text('caption');\n`,
    );
    assert.deepEqual(reads, [{ namespace: 'admin-orders', key: 'queue.caption' }]);
  });

  it('keeps a trailing digit attached to the namespace it belongs to', () => {
    // `adminWave2` is one namespace, not `admin-wave-2`. A naive camel-to-kebab
    // conversion splits on the digit and reports every Wave-2 key as missing.
    const { reads } = readsOf(
      `const placementMessage = messageView(VI_MESSAGES.adminWave2, 'placement');\n` +
        `const A = placementMessage.text('title');\n`,
    );
    assert.deepEqual(reads, [{ namespace: 'admin-wave2', key: 'placement.title' }]);
  });

  it('resolves a view that hydrates the brand, and one written across lines', () => {
    const { reads } = readsOf(
      `const orderAccessMessage = messageView(\n` +
        `  hydrateMessages(VI_MESSAGES.orders, { brand: BRAND_NAME }),\n` +
        `  'orderAccess',\n` +
        `);\n` +
        `const A = orderAccessMessage.text('title');\n`,
    );
    assert.deepEqual(reads, [{ namespace: 'orders', key: 'orderAccess.title' }]);
  });

  it('resolves an unprefixed view against the namespace root', () => {
    const { reads } = readsOf(
      `const commonMessage = messageView(VI_MESSAGES.common);\n` +
        `const A = commonMessage.text('value.unknown');\n`,
    );
    assert.deepEqual(reads, [{ namespace: 'common', key: 'value.unknown' }]);
  });

  it('reports a computed key rather than skipping it', () => {
    // A key built at runtime is the one thing this gate cannot verify. Silently
    // ignoring it would let a whole feature opt out of the check.
    const { unresolved, reads } = readsOf(
      `const m = messageView(VI_MESSAGES.storefront, 'homepage');\n` +
        'const A = m.text(`hero.${part}`);\n',
    );
    assert.deepEqual(reads, []);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].ident, 'm');
  });

  it('ignores a `.text(` call on something that is not a message view', () => {
    const { reads, unresolved } = readsOf(`const A = response.text('body');\n`);
    assert.deepEqual(reads, []);
    assert.deepEqual(unresolved, []);
  });
});

describe('the shipped repository', () => {
  it('has no missing key, no computed key and no orphan', () => {
    assert.deepEqual(run(REPOSITORY_ROOT), []);
  });
});
