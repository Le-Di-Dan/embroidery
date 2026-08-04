/**
 * Canonicalization and RFC 8785 conformance.
 *
 * The vectors below are the ones that separate JCS from "sorted
 * `JSON.stringify`". Key ordering is by **UTF-16 code unit**, so `"Z"` sorts
 * before `"a"` and a Vietnamese key sorts by code point rather than by any
 * locale's collation — a `localeCompare` implementation would pass a naive test
 * and produce different bytes on a machine with a different default locale.
 *
 * The pipeline case that matters is revalidation: a width of `0.00004`
 * validates fine, then quantizes to `0`, which the schema forbids. Without a
 * second pass that document would be canonicalized and hashed in a state it
 * never legally held.
 */
import { documentWith, emptyDocument, textElement, transform } from '../testing/fixtures';
import { DesignDocumentCanonicalizationError, canonicalizeJson } from './jcs';
import {
  canonicalizeDesignDocument,
  canonicalizeDesignDocumentToBytes,
  prepareDesignDocument,
} from './canonicalize';

describe('RFC 8785 conformance vectors', () => {
  it('sorts object keys by UTF-16 code unit, not by locale', () => {
    expect(canonicalizeJson({ b: 1, a: 2, Z: 3 })).toBe('{"Z":3,"a":2,"b":1}');
    // Under a Vietnamese collation "ă" sorts next to "a"; by code unit it does not.
    expect(canonicalizeJson({ ă: 1, b: 2, a: 3 })).toBe('{"a":3,"b":2,"ă":1}');
  });

  it('sorts nested objects independently at every level', () => {
    expect(canonicalizeJson({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('preserves array order, because JCS never reorders arrays', () => {
    expect(canonicalizeJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalizeJson({ a: ['z', 'a'] })).toBe('{"a":["z","a"]}');
  });

  it('serializes numbers with the ECMAScript algorithm JCS adopts', () => {
    expect(canonicalizeJson({ v: 1 })).toBe('{"v":1}');
    expect(canonicalizeJson({ v: 1.5 })).toBe('{"v":1.5}');
    expect(canonicalizeJson({ v: -0 })).toBe('{"v":0}');
    expect(canonicalizeJson({ v: 1e21 })).toBe('{"v":1e+21}');
    expect(canonicalizeJson({ v: 1e-7 })).toBe('{"v":1e-7}');
  });

  it('escapes control characters in the shortest form and leaves text literal', () => {
    expect(canonicalizeJson({ v: '\n\t"\\' })).toBe('{"v":"\\n\\t\\"\\\\"}');
    expect(canonicalizeJson({ v: '' })).toBe('{"v":"\\u0007"}');
    expect(canonicalizeJson({ v: 'Thêu' })).toBe('{"v":"Thêu"}');
  });

  it('escapes a lone surrogate rather than emitting invalid UTF-8', () => {
    expect(canonicalizeJson({ v: '\ud800' })).toBe('{"v":"\\ud800"}');
  });

  it('omits undefined entirely and keeps explicit null', () => {
    expect(canonicalizeJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('refuses values that are not JSON data', () => {
    for (const bad of [Number.NaN, () => 1, Symbol('x'), 1n, new Date(0)]) {
      expect(() => canonicalizeJson({ v: bad })).toThrow(DesignDocumentCanonicalizationError);
    }
  });
});

describe('document canonicalization', () => {
  it('produces identical bytes regardless of insertion order', () => {
    const a = { schemaVersion: 1, placement: emptyDocument().placement, elements: [] };
    const b = { elements: [], placement: emptyDocument().placement, schemaVersion: 1 };
    expect(canonicalizeDesignDocument(a)).toBe(canonicalizeDesignDocument(b));
  });

  it('produces identical bytes when element fields are written in another order', () => {
    const one = documentWith([textElement()]);
    const shuffled = documentWith([
      Object.fromEntries(
        Object.entries(textElement()).sort(([left], [right]) => (left < right ? 1 : -1)),
      ) as never,
    ]);
    expect(canonicalizeDesignDocument(one)).toBe(canonicalizeDesignDocument(shuffled));
  });

  it('keeps element array order significant', () => {
    const forward = documentWith([textElement({ id: 'a' }), textElement({ id: 'b' })]);
    const reversed = documentWith([textElement({ id: 'b' }), textElement({ id: 'a' })]);
    expect(canonicalizeDesignDocument(forward)).not.toBe(canonicalizeDesignDocument(reversed));
  });

  it('is byte-identical when repeated', () => {
    const document = documentWith([textElement()]);
    const first = canonicalizeDesignDocumentToBytes(document);
    const second = canonicalizeDesignDocumentToBytes(document);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('emits UTF-8 bytes, so Vietnamese text costs more bytes than characters', () => {
    const document = documentWith([textElement({ text: 'ệ' })]);
    const canonical = canonicalizeDesignDocument(document);
    const bytes = canonicalizeDesignDocumentToBytes(document);
    expect(bytes.byteLength).toBeGreaterThan(canonical.length);
  });

  it('does not mutate the document it canonicalizes', () => {
    const document = documentWith([textElement()]);
    const before = JSON.parse(JSON.stringify(document)) as unknown;
    canonicalizeDesignDocument(document);
    expect(document).toEqual(before);
  });
});

describe('the pipeline', () => {
  it('validates, quantizes and canonicalizes in that order', () => {
    const result = prepareDesignDocument(
      documentWith([textElement({ transform: transform({ x: 10.000_04 }) })]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.elements[0]?.transform.x).toBe(10);
      expect(result.value.canonical).toContain('"x":10');
    }
  });

  it('revalidates after quantization, catching a value rounded onto a boundary', () => {
    // 0.00004 is a legal positive width; quantized it becomes 0, which is not.
    const result = prepareDesignDocument(
      documentWith([textElement({ transform: transform({ width: 0.000_04 }) })]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings.map((item) => item.code)).toContain('INVALID_DOCUMENT');
  });

  it('stops at the first failing stage and returns typed findings', () => {
    const result = prepareDesignDocument({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings.map((item) => item.code)).toEqual(['UNSUPPORTED_SCHEMA_VERSION']);
    }
  });

  it('never embeds the raw document in a canonicalization finding', () => {
    const result = prepareDesignDocument(documentWith([textElement({ text: 'SECRET-MARKER' })]));
    expect(result.ok).toBe(true);
    const failure = prepareDesignDocument({ schemaVersion: 1, placement: null, elements: [] });
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(JSON.stringify(failure.findings)).not.toContain('SECRET-MARKER');
  });
});
