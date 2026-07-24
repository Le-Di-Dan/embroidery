import {
  CanonicalizationError,
  canonicalize,
  documentHash,
  lastHashSource,
} from '../src/document/canonical';
import { sha256Hex } from '../src/document/sha256';
import { commonScene } from '../src/document/scene';

describe('canonical form', () => {
  it('orders keys and ignores authoring order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ a: 2, b: 1 })).toBe(canonicalize({ b: 1, a: 2 }));
  });

  it('preserves array order because array order is z-order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits undefined and keeps explicit null', () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('normalizes negative zero and quantizes float noise', () => {
    expect(canonicalize({ v: -0 })).toBe('{"v":0}');
    expect(canonicalize({ v: 0.1 + 0.2 })).toBe('{"v":0.3}');
  });

  it('normalizes strings to NFC so the same text always hashes the same', () => {
    const composed = 'é';
    const decomposed = 'é';
    expect(canonicalize({ t: decomposed })).toBe(canonicalize({ t: composed }));
  });

  it('refuses values that cannot exist in a design document', () => {
    expect(() => canonicalize({ v: Number.NaN })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ v: () => 1 })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ v: new Date() })).toThrow(CanonicalizationError);
  });
});

describe('hashing', () => {
  it('matches the FIPS 180-4 "abc" vector', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees between Web Crypto and the pure-JS fallback', async () => {
    const scene = commonScene();
    const viaWebCrypto = await documentHash(scene);
    expect(lastHashSource).toBe('web-crypto');
    const bytes = new TextEncoder().encode(canonicalize(scene));
    expect(viaWebCrypto).toBe(`sha256:${sha256Hex(bytes)}`);
  });

  it('is stable across independent serializations of the same document', async () => {
    expect(await documentHash(commonScene())).toBe(await documentHash(commonScene()));
  });
});
