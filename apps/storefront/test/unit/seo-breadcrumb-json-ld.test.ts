/**
 * @jest-environment node
 *
 * `BreadcrumbList` structured data (`APP11-S04`).
 *
 * The document describes a trail the page visibly draws, and this file guards
 * the two properties that make that safe: only public route and title facts go
 * in, and what comes out cannot break the `<script>` element it is embedded in.
 */
import { buildBreadcrumbListJsonLd } from '../../src/features/storefront-seo/model/breadcrumb-json-ld';
import { serializeJsonLd } from '../../src/features/storefront-seo/model/json-ld-serialization';

const ORIGIN = 'https://shop.example.test';

beforeEach(() => {
  process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGIN;
});

describe('the document', () => {
  it('is a BreadcrumbList with 1-based consecutive positions', () => {
    const document = buildBreadcrumbListJsonLd([
      { name: 'Khám phá', path: '/kham-pha' },
      { name: 'Khăn', path: '/kham-pha?category=khan' },
      { name: 'Chiếc khăn tay cưới' },
    ]);

    expect(document['@context']).toBe('https://schema.org');
    expect(document['@type']).toBe('BreadcrumbList');
    expect(document.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
  });

  it('resolves every linked crumb to an absolute URL on the canonical origin', () => {
    const document = buildBreadcrumbListJsonLd([
      { name: 'Bộ sưu tập', path: '/bo-suu-tap' },
      { name: 'Mùa hè' },
    ]);

    expect(document.itemListElement[0]?.item).toBe(`${ORIGIN}/bo-suu-tap`);
  });

  it('gives the current page a name and no URL', () => {
    // The same reason the visible crumb is text rather than a link: an item
    // pointing at the page you are already on is a dead control.
    const document = buildBreadcrumbListJsonLd([
      { name: 'Bộ sưu tập', path: '/bo-suu-tap' },
      { name: 'Mùa hè' },
    ]);

    expect(document.itemListElement.at(-1)).not.toHaveProperty('item');
  });

  it('keeps the Gallery trail flat, at two levels', () => {
    // `NESTED_COLLECTION_WORK_MODEL = false`: there is no parent collection
    // between the feed and an entry, so a third crumb would name a grouping the
    // data model does not have.
    const document = buildBreadcrumbListJsonLd([
      { name: 'Bộ sưu tập', path: '/bo-suu-tap' },
      { name: 'Mùa hè' },
    ]);

    expect(document.itemListElement).toHaveLength(2);
  });

  it('carries nothing but names and public paths', () => {
    // The builder's input is `{ name, path }`; there is structurally no field an
    // id, an `isIndexable`, a storage key or a customer fact could travel in.
    const serialized = JSON.stringify(
      buildBreadcrumbListJsonLd([{ name: 'Bộ sưu tập', path: '/bo-suu-tap' }, { name: 'Mùa hè' }]),
    );

    const parsed = JSON.parse(serialized) as { itemListElement: Record<string, unknown>[] };

    expect(Object.keys(parsed.itemListElement[0] ?? {}).sort()).toEqual([
      '@type',
      'item',
      'name',
      'position',
    ]);
    expect(serialized).not.toMatch(/isIndexable|galleryEntryId|assetId|productId/i);
  });
});

describe('serialization safety', () => {
  it('makes a closing script tag unwritable', () => {
    // An operator-authored title is the untrusted input here. Unescaped, this
    // would terminate the `<script>` element and inject what followed.
    const output = serializeJsonLd(
      buildBreadcrumbListJsonLd([{ name: '</script><img onerror=alert(1)>' }]),
    );

    expect(output).not.toContain('</script>');
    expect(output).not.toContain('<');
    expect(output).not.toContain('&');
  });

  it('stays byte-for-byte equivalent JSON after escaping', () => {
    // `\u003c` and `\u0026` are the same characters to any JSON parser, so a
    // crawler reads exactly the title the page displays.
    const name = 'Khăn <cưới> & lụa';
    const output = serializeJsonLd(buildBreadcrumbListJsonLd([{ name }]));

    const parsed = JSON.parse(output) as { itemListElement: { name: string }[] };

    expect(parsed.itemListElement[0]?.name).toBe(name);
  });

  it('is produced from typed fields, never from concatenated JSON', () => {
    // A regression guard on the shape rather than on the implementation: the
    // output must parse, which a hand-built string with an unescaped quote in a
    // title would not.
    const output = serializeJsonLd(buildBreadcrumbListJsonLd([{ name: 'A "quoted" title' }]));

    expect(() => JSON.parse(output) as unknown).not.toThrow();
  });
});
