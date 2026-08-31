/**
 * @jest-environment node
 *
 * `STOREFRONT_PUBLIC_ORIGIN` validation (`APP11-S04`).
 *
 * The variable is the sole public browser-origin authority (IMP-D050 /
 * `APP4-B05`), and the Storefront now reads the same one the worker does. What
 * this file guards is that the two agree on what a valid origin *is*: a
 * Storefront that accepted a trailing path or a fragment would publish canonical
 * URLs the worker would refuse to mint a link for, and the "one authority" rule
 * would be a comment rather than a property.
 *
 * Every value here is synthetic. Nothing reads or prints the configured value.
 */
import {
  loadStorefrontPublicOrigin,
  toAbsolutePublicUrl,
  STOREFRONT_PUBLIC_ORIGIN_ENV,
} from '../../src/config/public-origin';

const ENV = STOREFRONT_PUBLIC_ORIGIN_ENV;

function load(value?: string): string {
  return loadStorefrontPublicOrigin(value === undefined ? {} : { [ENV]: value });
}

describe('the accepted origin shape', () => {
  it('accepts https and http', () => {
    expect(load('https://shop.example.test')).toBe('https://shop.example.test');
    expect(load('http://embroidery.test')).toBe('http://embroidery.test');
  });

  it('keeps a non-default port, which is part of the origin', () => {
    expect(load('http://embroidery.test:8080')).toBe('http://embroidery.test:8080');
  });

  it('normalises a trailing slash away, so composition cannot double it', () => {
    // `https://x//kham-pha` and `https://x/kham-pha` are different URLs to a
    // crawler; only one of them is a page.
    expect(load('https://shop.example.test/')).toBe('https://shop.example.test');
  });

  it('trims surrounding whitespace rather than rejecting it', () => {
    expect(load('  https://shop.example.test  ')).toBe('https://shop.example.test');
  });
});

describe('the rejected values', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
    ['relative', '/kham-pha'],
    ['host without scheme', 'embroidery.test'],
    ['non-http scheme', 'ftp://embroidery.test'],
    ['credentials', 'https://user:pass@embroidery.test'],
    ['query', 'https://embroidery.test?utm_source=x'],
    ['fragment', 'https://embroidery.test#t=abc'],
    ['application path', 'https://embroidery.test/store'],
  ])('rejects %s', (_label, value) => {
    expect(() => load(value)).toThrow(ENV);
  });

  it('names the variable and never echoes the value it rejected', () => {
    // The origin is public configuration rather than a secret, but a validator
    // that echoed its input would be the wrong habit beside the ones that must
    // not — and an operator debugging this reads the variable name, not a value
    // they already typed.
    const failing = () => load('https://user:hunter2@embroidery.test');

    expect(failing).toThrow(`${ENV} must not carry credentials.`);
    expect(failing).not.toThrow(/hunter2/);
  });
});

describe('no lookalike variable can satisfy the authority', () => {
  it.each([
    'STOREFRONT_HOST',
    'INTERNAL_API_BASE_URL',
    'NEXT_PUBLIC_STOREFRONT_ORIGIN',
    'SITE_URL',
    'BASE_URL',
    'APP_URL',
    'PUBLIC_URL',
    'STAFF_ALLOWED_ORIGINS',
    'DESIGN_SESSION_ALLOWED_ORIGINS',
  ])('%s is not read as a substitute', (name) => {
    // Each of these exists, or plausibly could, and each answers a different
    // question — a gateway hostname, a compose-network address, a CSRF
    // allowlist. Promoting one would make an unrelated operational change
    // silently repoint every canonical URL the store publishes.
    expect(() => loadStorefrontPublicOrigin({ [name]: 'https://wrong.example.test' })).toThrow(ENV);
  });

  it('has no default, no fallback and no localhost guess', () => {
    expect(() => loadStorefrontPublicOrigin({})).toThrow(`${ENV} is not set.`);
  });
});

describe('absolute URL composition', () => {
  const withOrigin = (value: string, run: () => void) => {
    const previous = process.env[ENV];
    process.env[ENV] = value;
    try {
      run();
    } finally {
      if (previous === undefined) delete process.env[ENV];
      else process.env[ENV] = previous;
    }
  };

  it('joins the normalised origin to a root-relative path', () => {
    withOrigin('https://shop.example.test/', () => {
      expect(toAbsolutePublicUrl('/bo-suu-tap')).toBe('https://shop.example.test/bo-suu-tap');
      expect(toAbsolutePublicUrl('/')).toBe('https://shop.example.test/');
    });
  });

  it('refuses a path that is not root-relative', () => {
    // `https://hostkham-pha` is the failure this prevents.
    withOrigin('https://shop.example.test', () => {
      expect(() => toAbsolutePublicUrl('kham-pha')).toThrow('root-relative');
    });
  });

  it('fails closed when the origin is unset, at the consumer', () => {
    const previous = process.env[ENV];
    delete process.env[ENV];
    try {
      expect(() => toAbsolutePublicUrl('/kham-pha')).toThrow(ENV);
    } finally {
      if (previous !== undefined) process.env[ENV] = previous;
    }
  });
});
