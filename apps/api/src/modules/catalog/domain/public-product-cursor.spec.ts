/**
 * The public list cursor (`APP2-B04` §9/§10).
 *
 * The properties that matter are that a cursor round-trips exactly, that every
 * malformed or foreign cursor fails the same way, and that a cursor issued
 * under one filter cannot be replayed under another — because that last one is
 * how keyset pagination silently skips or repeats rows.
 */
import { decodePublicProductCursor, encodePublicProductCursor } from './public-product-cursor';
import { isPublicProductCatalogError } from './public-product-catalog.errors';

const ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

function expectInvalid(run: () => unknown): void {
  try {
    run();
  } catch (error: unknown) {
    expect(isPublicProductCatalogError(error)).toBe(true);
    if (isPublicProductCatalogError(error)) {
      expect(error.code).toBe('PUBLIC_PRODUCT_CURSOR_INVALID');
      // The message must not describe which check failed.
      expect(error.message).toBe('The supplied pagination cursor is not valid.');
    }
    return;
  }
  throw new Error('expected the cursor to be rejected');
}

describe('public product cursor', () => {
  it('round-trips a position without a filter', () => {
    const encoded = encodePublicProductCursor({
      displayOrder: 40,
      id: ID,
      categorySlug: undefined,
    });
    expect(decodePublicProductCursor(encoded, undefined)).toEqual({ displayOrder: 40, id: ID });
  });

  it('round-trips a position under a filter', () => {
    const encoded = encodePublicProductCursor({ displayOrder: 0, id: ID, categorySlug: 'khan' });
    expect(decodePublicProductCursor(encoded, 'khan')).toEqual({ displayOrder: 0, id: ID });
  });

  it('is opaque: the encoded form is not the readable position', () => {
    const encoded = encodePublicProductCursor({ displayOrder: 40, id: ID, categorySlug: 'khan' });
    expect(encoded).not.toContain(ID);
    expect(encoded).not.toContain('khan');
    expect(encoded).not.toContain('40');
  });

  it('rejects a cursor issued under a different filter', () => {
    const encoded = encodePublicProductCursor({ displayOrder: 10, id: ID, categorySlug: 'khan' });
    expectInvalid(() => decodePublicProductCursor(encoded, 'thu-bong'));
    expectInvalid(() => decodePublicProductCursor(encoded, undefined));
  });

  it('rejects an unfiltered cursor replayed under a filter', () => {
    const encoded = encodePublicProductCursor({
      displayOrder: 10,
      id: ID,
      categorySlug: undefined,
    });
    expectInvalid(() => decodePublicProductCursor(encoded, 'khan'));
  });

  it('rejects malformed, tampered and hostile cursors identically', () => {
    const valid = encodePublicProductCursor({ displayOrder: 1, id: ID, categorySlug: undefined });
    for (const bad of [
      '',
      'not-base64url!!',
      Buffer.from('{}', 'utf8').toString('base64url'),
      Buffer.from('["only-one"]', 'utf8').toString('base64url'),
      Buffer.from('[1,2]', 'utf8').toString('base64url'),
      Buffer.from('["-:notanumber","id"]', 'utf8').toString('base64url'),
      Buffer.from('["-:1.5","id"]', 'utf8').toString('base64url'),
      Buffer.from('["-:1e3","id"]', 'utf8').toString('base64url'),
      Buffer.from('["nocolon","id"]', 'utf8').toString('base64url'),
      Buffer.from('["-:1",""]', 'utf8').toString('base64url'),
      `${valid}tampered`,
      'a'.repeat(600),
    ]) {
      expectInvalid(() => decodePublicProductCursor(bad, undefined));
    }
  });

  it('keeps a negative editorial position usable', () => {
    // `display_order` is a plain integer with no non-negative CHECK, so a
    // negative value must paginate rather than be rejected as malformed.
    const encoded = encodePublicProductCursor({
      displayOrder: -5,
      id: ID,
      categorySlug: undefined,
    });
    expect(decodePublicProductCursor(encoded, undefined).displayOrder).toBe(-5);
  });
});
