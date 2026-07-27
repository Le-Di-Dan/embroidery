/**
 * The deterministic identity helpers: idempotency key, scope hash, filename
 * normalization, canonical JSON and both fingerprints.
 *
 * These are grouped because they are one contract read from two ends — a change
 * to any of them changes what "the same request" means, and every case below
 * exists to pin that meaning rather than to exercise a branch.
 */
import { canonicalize, fingerprintOf, sha256Hex, SHA256_PATTERN } from './canonical-json';
import {
  buildScopeKey,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  parseIdempotencyKey,
} from './idempotency-key';
import { normalizeFilename } from './normalized-filename';
import { buildContentFingerprint, buildRequestFingerprint } from './intake-fingerprints';
import { isAssetIntakeError } from './asset-intake.errors';

const ACTOR = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';

function codeOf(work: () => unknown): string {
  try {
    work();
  } catch (error: unknown) {
    return isAssetIntakeError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return 'no-error';
}

describe('parseIdempotencyKey', () => {
  it('accepts the documented charset at both length bounds', () => {
    const shortest = 'a'.repeat(MIN_IDEMPOTENCY_KEY_LENGTH);
    const longest = 'b'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH);
    expect(parseIdempotencyKey(shortest)).toBe(shortest);
    expect(parseIdempotencyKey(longest)).toBe(longest);
    expect(parseIdempotencyKey('Ab0._:-Xyz')).toBe('Ab0._:-Xyz');
  });

  it('rejects lengths outside the bounds', () => {
    expect(codeOf(() => parseIdempotencyKey('a'.repeat(MIN_IDEMPOTENCY_KEY_LENGTH - 1)))).toBe(
      'IDEMPOTENCY_KEY_INVALID',
    );
    expect(codeOf(() => parseIdempotencyKey('a'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1)))).toBe(
      'IDEMPOTENCY_KEY_INVALID',
    );
  });

  it.each([
    ['missing', undefined],
    ['array header', ['key-one', 'key-two']],
    ['whitespace', 'abcdefg h'],
    ['leading space', ' abcdefgh'],
    ['trailing space', 'abcdefgh '],
    ['slash', 'abcdef/gh'],
    ['unicode', 'abcdefgé'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(codeOf(() => parseIdempotencyKey(value))).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it('never normalises: a trailing space is a rejection, not an alias', () => {
    // Trimming would make two distinct client keys share one claim, which is
    // the one thing an idempotency arbiter must never do.
    expect(codeOf(() => parseIdempotencyKey('abcdefgh '))).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});

describe('buildScopeKey', () => {
  it('hashes rather than storing the raw key', () => {
    const scope = buildScopeKey(ACTOR, 'upload-key-1');
    expect(scope).toMatch(SHA256_PATTERN);
    expect(scope).not.toContain('upload-key-1');
    expect(scope).not.toContain(ACTOR);
  });

  it('is stable for one pair and distinct across actors and keys', () => {
    expect(buildScopeKey(ACTOR, 'k-1')).toBe(buildScopeKey(ACTOR, 'k-1'));
    expect(buildScopeKey(ACTOR, 'k-1')).not.toBe(buildScopeKey(ACTOR, 'k-2'));
    expect(buildScopeKey(ACTOR, 'k-1')).not.toBe(
      buildScopeKey('019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08', 'k-1'),
    );
  });
});

describe('normalizeFilename', () => {
  it.each([
    ['plain', 'logo.png', 'logo.png'],
    ['windows path', 'C:\\Users\\dan\\Pictures\\logo.png', 'logo.png'],
    ['posix path', '/tmp/uploads/logo.png', 'logo.png'],
    ['mixed separators', 'C:/a\\b/logo.png', 'logo.png'],
    ['whitespace runs', '  my   logo  .png  ', 'my logo .png'],
    ['non-ASCII space runs', 'my  logo.png', 'my logo.png'],
  ])('normalises %s', (_label, raw, expected) => {
    expect(normalizeFilename(raw)).toBe(expected);
  });

  it('preserves case, because two cases are two requests', () => {
    expect(normalizeFilename('Logo.PNG')).toBe('Logo.PNG');
    expect(normalizeFilename('Logo.PNG')).not.toBe(normalizeFilename('logo.png'));
  });

  it('applies NFC so canonically equal names hash alike', () => {
    const composed = 'é.png';
    const decomposed = 'e\u0301.png';
    expect(normalizeFilename(decomposed)).toBe(normalizeFilename(composed));
  });

  it.each([
    ['NUL', 'lo\u0000go.png'],
    ['control character', 'lo\u0007go.png'],
    // A tab is a control character (0x09), so step 1 rejects it before the
    // whitespace-collapsing step could ever see it.
    ['tab', 'my	logo.png'],
    ['empty after trim', '   '],
    ['only separators', '///'],
    ['non-string', 42],
    ['over 255 UTF-8 bytes', `${'ä'.repeat(128)}.png`],
  ])('rejects %s', (_label, raw) => {
    expect(codeOf(() => normalizeFilename(raw))).toBe('ASSET_UPLOAD_METADATA_INVALID');
  });

  it('drops a traversal segment by taking the basename', () => {
    expect(normalizeFilename('../../etc/passwd')).toBe('passwd');
  });
});

describe('canonical JSON', () => {
  it('sorts keys, so authoring order cannot change a hash', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(fingerprintOf({ b: 1, a: 2 })).toBe(fingerprintOf({ a: 2, b: 1 }));
  });

  it('emits no insignificant whitespace', () => {
    expect(canonicalize({ a: [1, 2], b: 'x' })).toBe('{"a":[1,2],"b":"x"}');
  });

  it('sorts nested objects too', () => {
    expect(canonicalize({ z: { d: 1, c: 2 } })).toBe('{"z":{"c":2,"d":1}}');
  });

  it('produces the prefixed lowercase-hex form', () => {
    expect(sha256Hex('abc')).toMatch(SHA256_PATTERN);
    expect(sha256Hex('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('refuses a non-integer number rather than emitting a platform-dependent form', () => {
    expect(() => canonicalize({ a: 1.5 })).toThrow(TypeError);
  });
});

describe('request fingerprint V1', () => {
  const base = {
    scopeKey: buildScopeKey(ACTOR, 'upload-key-1'),
    declaredMediaType: 'image/png' as const,
    normalizedFilename: 'logo.png',
  };

  it('is stable and prefixed', () => {
    expect(buildRequestFingerprint(base)).toBe(buildRequestFingerprint({ ...base }));
    expect(buildRequestFingerprint(base)).toMatch(SHA256_PATTERN);
  });

  it('changes when any bound input changes', () => {
    const baseline = buildRequestFingerprint(base);
    expect(buildRequestFingerprint({ ...base, normalizedFilename: 'other.png' })).not.toBe(
      baseline,
    );
    expect(buildRequestFingerprint({ ...base, declaredMediaType: 'image/webp' })).not.toBe(
      baseline,
    );
    expect(
      buildRequestFingerprint({ ...base, scopeKey: buildScopeKey(ACTOR, 'upload-key-2') }),
    ).not.toBe(baseline);
  });

  it('matches the exact canonical document the contract specifies', () => {
    // Pinned literally: if the field set or the constants drift, this fails
    // rather than silently changing what "the same request" means.
    const expected = fingerprintOf({
      version: 1,
      operationNamespace: 'admin.asset.upload',
      scopeKey: base.scopeKey,
      assetKind: 'CATALOG_MEDIA',
      classification: 'PRODUCTION_SENSITIVE',
      declaredMediaType: 'image/png',
      normalizedFilename: 'logo.png',
    });
    expect(buildRequestFingerprint(base)).toBe(expected);
  });
});

describe('content fingerprint V1', () => {
  const facts = {
    mediaType: 'image/png' as const,
    byteSize: 26_214_400,
    checksum: `sha256:${'a'.repeat(64)}`,
  };

  it('matches the exact canonical document the contract specifies', () => {
    expect(buildContentFingerprint(facts)).toBe(
      fingerprintOf({
        version: 1,
        mediaType: 'image/png',
        byteSize: 26_214_400,
        checksum: facts.checksum,
      }),
    );
  });

  it('changes when any observed fact changes', () => {
    const baseline = buildContentFingerprint(facts);
    expect(buildContentFingerprint({ ...facts, byteSize: facts.byteSize - 1 })).not.toBe(baseline);
    expect(buildContentFingerprint({ ...facts, mediaType: 'image/jpeg' })).not.toBe(baseline);
    expect(buildContentFingerprint({ ...facts, checksum: `sha256:${'b'.repeat(64)}` })).not.toBe(
      baseline,
    );
  });

  it('is independent of the request fingerprint', () => {
    expect(buildContentFingerprint(facts)).not.toBe(
      buildRequestFingerprint({
        scopeKey: buildScopeKey(ACTOR, 'upload-key-1'),
        declaredMediaType: 'image/png',
        normalizedFilename: 'logo.png',
      }),
    );
  });
});
