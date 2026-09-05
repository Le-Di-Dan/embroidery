/**
 * The canonical message repository's own contract (`APP12-V02` §5A.13).
 *
 * These are the assertions that make §5A.14's acceptance intent real: a Product
 * Owner edits one JSON file and the runtime surface changes. That only holds if
 * the JSON parses, if the namespaces are the ones both applications load, and
 * if a key that is not there fails loudly instead of rendering itself.
 */
import { hydrateMessages } from './hydrate';
import { formatMessage, messageView } from './message-view';
import { MESSAGE_NAMESPACES, VI_MESSAGES, getMessages } from './messages';

describe('the repository', () => {
  it('exposes one namespace per domain, and the same set both applications load', () => {
    expect([...MESSAGE_NAMESPACES].sort()).toEqual([
      'admin',
      'adminOrders',
      'adminSupport',
      'adminWave2',
      'checkout',
      'common',
      'content',
      'custom',
      'orders',
      'seo',
      'storefront',
      'studio',
    ]);
  });

  it('parses, and holds real sentences rather than empty shells', () => {
    for (const namespace of MESSAGE_NAMESPACES) {
      const tree = VI_MESSAGES[namespace];
      expect(typeof tree).toBe('object');
      expect(Object.keys(tree).length).toBeGreaterThan(0);
    }
  });

  it('serves the default locale and refuses any other', () => {
    expect(getMessages()).toBe(VI_MESSAGES);
    expect(getMessages('vi')).toBe(VI_MESSAGES);
    // A locale with no repository must not silently fall back to Vietnamese:
    // a page in the wrong language that looks finished is the failure mode that
    // survives review.
    expect(() => getMessages('en')).toThrow(/No message repository/u);
  });

  it('carries the Storefront, the Admin and the shared surfaces', () => {
    expect(VI_MESSAGES.storefront).toHaveProperty('shell');
    expect(VI_MESSAGES.storefront).toHaveProperty('homepage');
    expect(VI_MESSAGES.admin).toHaveProperty('shell');
    expect(VI_MESSAGES.adminOrders).toHaveProperty('queue');
    expect(VI_MESSAGES.common).toHaveProperty('value');
    expect(VI_MESSAGES.seo).toHaveProperty('storefront');
    expect(VI_MESSAGES.seo).toHaveProperty('admin');
  });
});

describe('reading a message', () => {
  const view = messageView(VI_MESSAGES.storefront, 'homepage');

  it('resolves a Storefront key', () => {
    expect(view.text('hero.heading')).toBe(VI_MESSAGES.storefront.homepage.hero.heading);
  });

  it('resolves an Admin key', () => {
    const admin = messageView(VI_MESSAGES.adminOrders, 'queue');
    expect(typeof admin.text('page.title')).toBe('string');
    expect(admin.text('page.title').length).toBeGreaterThan(0);
  });

  it('resolves a list', () => {
    const story = view.list('story.paragraphs');
    expect(Array.isArray(story)).toBe(true);
    expect(story.length).toBeGreaterThan(0);
  });

  it('narrows to a sub-view', () => {
    expect(view.scope('hero').text('heading')).toBe(view.text('hero.heading'));
  });

  it('throws on a missing key outside production, rather than rendering it', () => {
    // §5A.13: fail-visible in development and test. Rendering the key produces
    // a page that looks finished and is not.
    expect(() => view.text('hero.thisKeyDoesNotExist')).toThrow(/Missing message key/u);
    expect(() => view.text('hero')).toThrow(/Missing message key/u);
  });
});

describe('interpolation', () => {
  it('substitutes a named placeholder', () => {
    expect(formatMessage('{count} đơn hàng', { count: 3 })).toBe('3 đơn hàng');
  });

  it('leaves an unsatisfied placeholder visible instead of blanking it', () => {
    // A hole nobody sees is worse than a marker somebody screenshots.
    expect(formatMessage('{count} đơn hàng', {})).toBe('{count} đơn hàng');
  });

  it('substitutes every occurrence', () => {
    expect(formatMessage('{a}-{a}', { a: 'x' })).toBe('x-x');
  });
});

describe('brand hydration', () => {
  it('fills `{brand}` throughout a subtree', () => {
    const hydrated = hydrateMessages(
      { a: 'Xưởng {brand}', b: { c: ['{brand} xin chào'] } },
      { brand: 'Nét Thêu' },
    );
    expect(hydrated).toEqual({ a: 'Xưởng Nét Thêu', b: { c: ['Nét Thêu xin chào'] } });
  });

  it('never mutates the shared message tree', () => {
    // `VI_MESSAGES` is one object shared by every catalog and by next-intl. A
    // substitution written into it would leak into readers that never asked.
    const before = JSON.stringify(VI_MESSAGES.storefront);
    hydrateMessages(VI_MESSAGES.storefront, { brand: 'CHANGED' });
    expect(JSON.stringify(VI_MESSAGES.storefront)).toBe(before);
  });

  it('keeps the store name out of the repository as literal text', () => {
    // The brand is identity owned by `@embroidery/ui`, not translatable copy —
    // `APP12-H06` had already had to fix one placeholder wordmark that survived
    // a rename. The repository holds the placeholder, never the name.
    const shell = JSON.stringify(VI_MESSAGES.storefront.shell);
    expect(shell).toContain('{brand}');
    expect(shell).not.toContain('Nét Thêu');
  });
});
