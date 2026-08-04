/**
 * Architecture guards.
 *
 * These read the source tree, because the things they forbid all compile: a
 * React import, a duplicated quantization constant, a snapping helper "just for
 * the editor". Each would pass `tsc` and each would move a responsibility out of
 * the package that owns it.
 *
 * The duplication guard is the one to read twice. `IMP-D045` reuses P01's
 * quantization scale and forbids a second precision; the cheapest way to end up
 * with two is for this package to write `10_000` once, "to avoid the import".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SRC = __dirname;

function sourceFiles(directory: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (extname(entry) === '.ts' && !entry.endsWith('.spec.ts')) found.push(full);
  }
  return found;
}

const PRODUCTION = sourceFiles().filter((file) => !file.includes(join(SRC, 'testing')));
const read = (file: string) => readFileSync(file, 'utf8');

/**
 * Source with comments removed.
 *
 * Token scans must look at code, not prose: this file's own guards first failed
 * on a doc comment quoting `DESIGN_DOCUMENT_QUANTIZATION_SCALE = 10_000` and one
 * explaining that a bounds option is for a *selection* outline. A guard that
 * cannot tell an explanation from an implementation punishes documentation.
 * `(^|[^:])//` keeps a `https://` inside a string intact.
 */
const codeOnly = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('dependency boundary', () => {
  it('imports only relative paths, node built-ins, and the design-document root', () => {
    for (const file of PRODUCTION) {
      for (const match of read(file).matchAll(/from\s+'([^']+)'/g)) {
        const specifier = match[1] ?? '';
        const allowed = specifier.startsWith('.') || specifier === '@embroidery/design-document';
        expect(allowed).toBe(true);
      }
    }
  });

  it('never deep-imports into design-document', () => {
    for (const file of PRODUCTION) {
      expect(read(file)).not.toMatch(/@embroidery\/design-document\//);
    }
  });

  it('imports no framework, renderer, database, storage or spike module', () => {
    const forbidden = [
      'react',
      'next',
      '@nestjs',
      'konva',
      'fabric',
      'interact.js',
      '@embroidery/database',
      '@embroidery/persistence',
      '@embroidery/object-storage',
      'spikes/',
    ];
    for (const file of PRODUCTION) {
      const source = codeOnly(file).toLowerCase();
      for (const name of forbidden) {
        expect(source).not.toContain(`from '${name}`);
      }
    }
  });

  it('imports no Node built-in and touches no DOM or canvas', () => {
    for (const file of PRODUCTION) {
      const source = read(file);
      expect(source).not.toMatch(/from\s+'node:/);
      for (const global of [
        'document.createElement',
        'window.',
        'HTMLCanvasElement',
        'getContext(',
      ]) {
        expect(source).not.toContain(global);
      }
    }
  });
});

describe('no duplication of design-document responsibilities', () => {
  it('does not restate the quantization scale', () => {
    for (const file of PRODUCTION) {
      // The bridge names the constant it re-exports; nothing writes the number.
      expect(codeOnly(file)).not.toMatch(/=\s*10_?000\b/);
    }
  });

  it('implements no canonicalization, hashing or font registry', () => {
    for (const file of PRODUCTION) {
      const source = codeOnly(file);
      for (const token of ['canonicaliz', 'sha256', 'createHash', 'fontId', 'woff2', 'JCS']) {
        expect(source.toLowerCase()).not.toContain(token.toLowerCase());
      }
    }
  });

  it('implements no schema validation or complexity limits', () => {
    for (const file of PRODUCTION) {
      const source = codeOnly(file);
      for (const token of [
        'schemaVersion =',
        'maxElements',
        'maxCanonicalBytes',
        'DUPLICATE_ELEMENT_ID',
      ]) {
        expect(source).not.toContain(token);
      }
    }
  });
});

describe('no interaction, renderer or transport concern', () => {
  it('implements no snapping, guides, handles or selection', () => {
    for (const file of PRODUCTION) {
      const source = codeOnly(file);
      for (const token of [
        'snapTo',
        'snapGrid',
        'guideLine',
        'resizeHandle',
        'selection',
        'pointer',
      ]) {
        expect(source.toLowerCase()).not.toContain(token.toLowerCase());
      }
    }
  });

  it('implements no API, persistence, worker or UI', () => {
    for (const file of PRODUCTION) {
      const source = codeOnly(file);
      for (const token of ['@Controller', '@Injectable', '@Module', 'useState(', 'jsx']) {
        expect(source).not.toContain(token);
      }
      expect(source).not.toMatch(/(class|interface)\s+\w*(Repository|JobHandler|Controller)\b/);
    }
  });

  it('mutates no document and moves no element', () => {
    for (const file of PRODUCTION) {
      const source = codeOnly(file);
      // A document or element property assignment would be a mutation.
      expect(source).not.toMatch(/\b(document|element)\.\w+\s*=[^=]/);
      for (const token of ['clampTo', 'moveInto', 'rebaseChildren', 'flattenGroup']) {
        expect(source).not.toContain(token);
      }
    }
  });
});

describe('no global mutable state', () => {
  it('declares no module-level let or var', () => {
    for (const file of PRODUCTION) {
      for (const line of read(file).split('\n')) {
        expect(line).not.toMatch(/^(let|var)\s+/);
      }
    }
  });

  it('exposes no cache or registry object', () => {
    for (const file of PRODUCTION) {
      const source = codeOnly(file);
      for (const token of ['export const cache', 'export let', 'globalThis.']) {
        expect(source).not.toContain(token);
      }
    }
  });
});

describe('file sizes', () => {
  it('keeps every production file within the repository limit', () => {
    for (const file of PRODUCTION) {
      expect(read(file).split('\n').length).toBeLessThanOrEqual(400);
    }
  });

  it('keeps every test file within the repository limit', () => {
    for (const file of sourceFiles().filter((candidate) => candidate.endsWith('.spec.ts'))) {
      expect(read(file).split('\n').length).toBeLessThanOrEqual(600);
    }
  });
});
