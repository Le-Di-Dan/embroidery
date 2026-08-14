/**
 * `STOREFRONT_PUBLIC_ORIGIN` validation (`APP4-B05`, IMP-D050).
 *
 * Each rejection below is a value someone would plausibly configure, not
 * vandalism: the URL with a trailing path because "that's where the page is",
 * the one with a query because it was copied from a browser, the credentialed
 * form from an internal tool. Every one of them produces a link that still looks
 * sendable and quietly breaks the fragment the token depends on.
 */
import {
  STOREFRONT_PUBLIC_ORIGIN_ENV,
  loadStorefrontPublicOrigin,
} from './storefront-origin.config';

const load = (value: string | undefined): string =>
  loadStorefrontPublicOrigin(value === undefined ? {} : { [STOREFRONT_PUBLIC_ORIGIN_ENV]: value });

describe('loadStorefrontPublicOrigin', () => {
  it('accepts an https origin and returns it without a trailing slash', () => {
    expect(load('https://shop.test.invalid')).toBe('https://shop.test.invalid');
    expect(load('https://shop.test.invalid/')).toBe('https://shop.test.invalid');
  });

  it('accepts http and a non-default port, as local development needs', () => {
    expect(load('http://embroidery.local')).toBe('http://embroidery.local');
    expect(load('http://embroidery.local:8085')).toBe('http://embroidery.local:8085');
  });

  it('trims surrounding whitespace an env file easily carries', () => {
    expect(load('  https://shop.test.invalid  ')).toBe('https://shop.test.invalid');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('fails closed when %s — there is no default', (_label, value) => {
    expect(() => load(value)).toThrow(STOREFRONT_PUBLIC_ORIGIN_ENV);
  });

  it.each([
    ['a bare hostname, which is what STOREFRONT_HOST is', 'embroidery.local'],
    ['a non-browser scheme', 'ftp://shop.test.invalid'],
    ['credentials in the authority', 'https://user:pw@shop.test.invalid'],
    ['a query', 'https://shop.test.invalid?utm=1'],
    ['a fragment', 'https://shop.test.invalid#already'],
    ['an application path', 'https://shop.test.invalid/vn'],
    ['a deeper path', 'https://shop.test.invalid/truy-cap'],
  ])('rejects %s', (_label, value) => {
    expect(() => load(value)).toThrow(STOREFRONT_PUBLIC_ORIGIN_ENV);
  });

  it('names the variable and never echoes the value', () => {
    // The origin is public configuration rather than a secret, but a validator
    // that echoed its input is the wrong habit beside three that must not.
    const rejected = 'https://user:hunter2@shop.test.invalid';
    let message = '';
    try {
      load(rejected);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(STOREFRONT_PUBLIC_ORIGIN_ENV);
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain(rejected);
  });
});
