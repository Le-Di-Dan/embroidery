/**
 * Server-side hashing and the export boundary that keeps it server-side.
 *
 * The boundary tests read the built export graph rather than trusting the
 * import statements: a re-export added three files deep would still pull
 * `node:crypto` into a Storefront bundle, and only walking the graph catches
 * that. APP0-R01 measured why it matters — `crypto.subtle` is undefined outside
 * a secure context, so a browser-side hash is not merely undesirable, it throws.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { canonicalizeDesignDocumentToBytes } from '../canonical/canonicalize';
import { documentWith, emptyDocument, textElement } from '../testing/fixtures';
import {
  formatDesignDocumentHash,
  hashCanonicalDesignDocumentBytesSha256,
  hashDesignDocumentSha256,
} from './index';

const SRC = resolve(__dirname, '..');

describe('known vectors', () => {
  it('matches the FIPS 180-4 "abc" digest', () => {
    const bytes = new TextEncoder().encode('abc');
    expect(hashCanonicalDesignDocumentBytesSha256(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the empty-input digest', () => {
    expect(hashCanonicalDesignDocumentBytesSha256(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('returns lowercase hexadecimal', () => {
    const digest = hashDesignDocumentSha256(emptyDocument());
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('formats the storage form with its algorithm prefix', () => {
    expect(formatDesignDocumentHash('a'.repeat(64))).toBe(`sha256:${'a'.repeat(64)}`);
  });
});

describe('determinism', () => {
  it('gives semantically identical documents the same digest', () => {
    const a = { schemaVersion: 1, placement: emptyDocument().placement, elements: [] };
    const b = { elements: [], placement: emptyDocument().placement, schemaVersion: 1 };
    expect(hashDesignDocumentSha256(a)).toBe(hashDesignDocumentSha256(b));
  });

  it('gives differently ordered element arrays different digests', () => {
    const forward = documentWith([textElement({ id: 'a' }), textElement({ id: 'b' })]);
    const reversed = documentWith([textElement({ id: 'b' }), textElement({ id: 'a' })]);
    expect(hashDesignDocumentSha256(forward)).not.toBe(hashDesignDocumentSha256(reversed));
  });

  it('is stable across repeated calls in one run', () => {
    const document = documentWith([textElement()]);
    expect(hashDesignDocumentSha256(document)).toBe(hashDesignDocumentSha256(document));
  });

  it('hashes canonical bytes, never JSON.stringify output', () => {
    const document = documentWith([textElement()]);
    const viaBytes = hashCanonicalDesignDocumentBytesSha256(
      canonicalizeDesignDocumentToBytes(document),
    );
    expect(hashDesignDocumentSha256(document)).toBe(viaBytes);
  });

  it('does not mutate the document it hashes', () => {
    const document = documentWith([textElement()]);
    const before = JSON.parse(JSON.stringify(document)) as unknown;
    hashDesignDocumentSha256(document);
    expect(document).toEqual(before);
  });
});

function readSource(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Follows relative imports from an entry point, returning every module reachable
 * from it — the graph a bundler would pull in, not merely the direct imports.
 */
function reachableFrom(entry: string, seen = new Set<string>()): Set<string> {
  const candidates = entry.endsWith('.ts') ? [entry] : [`${entry}.ts`, join(entry, 'index.ts')];
  const file = candidates.find((candidate) => readSource(candidate) !== undefined);
  if (file === undefined || seen.has(file)) return seen;
  seen.add(file);

  const source = readSource(file) ?? '';
  for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.startsWith('.')) continue;
    reachableFrom(resolve(dirname(file), specifier), seen);
  }
  return seen;
}

describe('the export boundary', () => {
  it('keeps every Node built-in out of the browser-safe root export', () => {
    const modules = reachableFrom(join(SRC, 'index.ts'));
    expect(modules.size).toBeGreaterThan(5);
    for (const file of modules) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+'node:/);
      expect(source).not.toMatch(/require\(['"]node:/);
    }
  });

  it('does not reach the server module from the root export', () => {
    const modules = [...reachableFrom(join(SRC, 'index.ts'))];
    expect(modules.some((file) => file === join(SRC, 'server', 'index.ts'))).toBe(false);
  });

  it('is the only place hashing lives', () => {
    const root = readFileSync(join(SRC, 'index.ts'), 'utf8');
    expect(root).not.toContain('hashDesignDocumentSha256');
    expect(root).not.toContain('createHash');
  });

  it('declares the server subpath in the package manifest', () => {
    const manifest = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as {
      exports: Record<string, { default: string }>;
    };
    expect(manifest.exports['.']?.default).toBe('./dist/index.js');
    expect(manifest.exports['./server']?.default).toBe('./dist/server/index.js');
  });
});
