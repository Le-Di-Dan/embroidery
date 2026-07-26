/**
 * `assertBoundedMetadata` / `readMetadata` are internal to the package — the
 * port exposes only the bounds as constants — so this spec imports the module
 * directly rather than widening the public surface just to test it.
 */
import { assertBoundedMetadata, readMetadata } from '../../src/object-metadata';
import {
  MAX_METADATA_ENTRIES,
  MAX_METADATA_KEY_LENGTH,
  MAX_METADATA_VALUE_LENGTH,
  ObjectMetadataError,
} from '../../src/index';

function entries(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_unused, index) => [`key-${String(index)}`, 'value']),
  );
}

describe('assertBoundedMetadata', () => {
  it('returns undefined when no metadata is supplied', () => {
    expect(assertBoundedMetadata(undefined)).toBeUndefined();
  });

  it('accepts a bounded, lowercase, printable-ASCII record', () => {
    const metadata = { 'asset-id': '0191b8f0-0000-7000-8000-000000000000', kind: 'original' };

    expect(assertBoundedMetadata(metadata)).toEqual(metadata);
  });

  it('accepts exactly the maximum number of entries', () => {
    expect(Object.keys(assertBoundedMetadata(entries(MAX_METADATA_ENTRIES)) ?? {})).toHaveLength(
      MAX_METADATA_ENTRIES,
    );
  });

  it('rejects one entry beyond the maximum', () => {
    expect(() => assertBoundedMetadata(entries(MAX_METADATA_ENTRIES + 1))).toThrow(
      ObjectMetadataError,
    );
  });

  it.each([
    ['Upper-Case', 'providers normalise metadata keys to lowercase'],
    ['has space', 'a space is not a legal header token'],
    ['-leading', 'must start alphanumeric'],
    ['trailing-', 'must end alphanumeric'],
    ['under_score', 'underscore is outside the conservative charset'],
    ['', 'empty key'],
  ])('rejects key %p (%s)', (key) => {
    expect(() => assertBoundedMetadata({ [key]: 'value' })).toThrow(ObjectMetadataError);
  });

  it('rejects an over-long key', () => {
    expect(() => assertBoundedMetadata({ ['a'.repeat(MAX_METADATA_KEY_LENGTH + 1)]: 'v' })).toThrow(
      ObjectMetadataError,
    );
  });

  it('rejects an over-long value', () => {
    expect(() =>
      assertBoundedMetadata({ kind: 'v'.repeat(MAX_METADATA_VALUE_LENGTH + 1) }),
    ).toThrow(ObjectMetadataError);
  });

  it('accepts a value at exactly the maximum length', () => {
    const value = 'v'.repeat(MAX_METADATA_VALUE_LENGTH);

    expect(assertBoundedMetadata({ kind: value })).toEqual({ kind: value });
  });

  it.each([
    ['thêu tay', 'non-ASCII Vietnamese text'],
    ['line\nbreak', 'a control character'],
    ['tab\there', 'a tab'],
  ])('rejects value %p (%s) before it reaches the provider', (value) => {
    // An S3-compatible store rejects these as a signature failure mid-upload,
    // long after the stream has started; failing here is the clear error.
    expect(() => assertBoundedMetadata({ kind: value })).toThrow(ObjectMetadataError);
  });

  it('names the offending key without echoing an unbounded value', () => {
    expect(() => assertBoundedMetadata({ kind: 'thêu' })).toThrow(/value for "kind"/);
  });
});

describe('readMetadata', () => {
  it('returns an empty record when the provider sent none', () => {
    expect(readMetadata(undefined)).toEqual({});
  });

  it('lowercases provider-returned keys so a round trip compares equal', () => {
    expect(readMetadata({ 'Asset-Id': 'abc', KIND: 'original' })).toEqual({
      'asset-id': 'abc',
      kind: 'original',
    });
  });

  it('drops non-string values rather than passing an unexpected shape on', () => {
    const raw = { kind: 'original', bogus: 42 } as unknown as Record<string, string>;

    expect(readMetadata(raw)).toEqual({ kind: 'original' });
  });
});
