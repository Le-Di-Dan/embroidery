/**
 * APP2-DB01 — the canonical derivative kind/state tuples.
 *
 * These assertions are deliberately literal. The tuples are the single source
 * DB5-A09 requires: the CHECK constraint, the TypeScript union and every
 * consumer derive from them, so a value silently added, renamed or reordered
 * here changes the physical schema on the next generate. Spelling the expected
 * contents out is what makes that visible in review.
 */
import { ASSET_DERIVATIVE_KINDS, ASSET_DERIVATIVE_STATES } from './asset/asset-derivatives';

describe('asset derivative kinds', () => {
  it('is exactly the five canonical kinds, in order', () => {
    expect(ASSET_DERIVATIVE_KINDS).toEqual([
      'PREVIEW_WATERMARKED',
      'MOCKUP',
      'NORMALIZED',
      'THUMBNAIL',
      'CATALOG_PREVIEW',
    ]);
  });

  it('adds CATALOG_PREVIEW exactly once', () => {
    expect(ASSET_DERIVATIVE_KINDS.filter((kind) => kind === 'CATALOG_PREVIEW')).toHaveLength(1);
  });

  it('leaves the four pre-APP2-DB01 kinds untouched', () => {
    // Sliced from the front rather than compared as a set: appending is a
    // compatible change, reordering is not — a partial index predicate and
    // several reports quote these positions.
    expect(ASSET_DERIVATIVE_KINDS.slice(0, 4)).toEqual([
      'PREVIEW_WATERMARKED',
      'MOCKUP',
      'NORMALIZED',
      'THUMBNAIL',
    ]);
  });

  it('introduces no generic PREVIEW alias', () => {
    // The whole point of the APP2-DB01 ruling: "preview" alone is ambiguous
    // between the watermarked customer preview and the catalog display copy.
    expect(ASSET_DERIVATIVE_KINDS).not.toContain('PREVIEW');
    expect(ASSET_DERIVATIVE_KINDS).not.toContain('CATALOG_PREVIEW_WATERMARKED');
  });

  it('has no duplicate value', () => {
    expect(new Set(ASSET_DERIVATIVE_KINDS).size).toBe(ASSET_DERIVATIVE_KINDS.length);
  });
});

describe('asset derivative states', () => {
  it('is unchanged by APP2-DB01', () => {
    expect(ASSET_DERIVATIVE_STATES).toEqual(['PENDING', 'PROCESSING', 'READY', 'FAILED']);
  });

  it('keeps PENDING as the entry state the catalog lane must transition through', () => {
    expect(ASSET_DERIVATIVE_STATES[0]).toBe('PENDING');
    expect(ASSET_DERIVATIVE_STATES.indexOf('PROCESSING')).toBe(1);
  });
});
