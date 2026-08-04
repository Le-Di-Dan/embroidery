/**
 * Architecture guards.
 *
 * These read the source tree rather than the type system, because the things
 * they forbid are the things a compiler is happy to accept: a React import, a
 * geometry helper "just for validation", a serialized watermark field. Each
 * would pass `tsc` and each would silently move a responsibility out of the
 * checkpoint that owns it.
 *
 * The geometry guard is the one to read twice. `APP3-P02` owns bounds, rotation
 * and px↔mm conversion; the cheapest way for that boundary to erode is for this
 * package to grow a "small" helper that rotates a rectangle in order to check
 * something. Searching for the trigonometry is cruder than a type, and that is
 * exactly why it works.
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

describe('dependency boundary', () => {
  it('imports nothing outside this package', () => {
    for (const file of PRODUCTION) {
      for (const match of read(file).matchAll(/from\s+'([^']+)'/g)) {
        const specifier = match[1] ?? '';
        const internal = specifier.startsWith('.');
        const nodeBuiltin = specifier.startsWith('node:');
        expect(internal || nodeBuiltin).toBe(true);
      }
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
      '@embroidery/design-engine',
      'spikes/',
    ];
    for (const file of PRODUCTION) {
      const source = read(file).toLowerCase();
      for (const name of forbidden) {
        expect(source).not.toContain(`from '${name}`);
      }
    }
  });

  it('touches no DOM, canvas or browser global', () => {
    for (const file of PRODUCTION) {
      const source = read(file);
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

  it('reads no file and opens no socket outside the server export', () => {
    for (const file of PRODUCTION) {
      if (file.includes(join(SRC, 'server'))) continue;
      const source = read(file);
      expect(source).not.toContain('node:fs');
      expect(source).not.toContain('node:path');
      expect(source).not.toContain('fetch(');
    }
  });
});

describe('geometry stays in APP3-P02', () => {
  it('computes no rotated bounds, projection or trigonometry', () => {
    for (const file of PRODUCTION) {
      const source = read(file);
      for (const token of ['Math.cos', 'Math.sin', 'Math.atan', 'Math.tan', 'Math.hypot']) {
        expect(source).not.toContain(token);
      }
    }
  });

  it('names no bounds, collision or unit-conversion concept', () => {
    for (const file of PRODUCTION) {
      const source = read(file);
      for (const token of [
        'function boundingBox',
        'function intersects',
        'function pxToMm',
        'function mmToPx',
        'isWithinArea',
        'snapTo',
      ]) {
        expect(source).not.toContain(token);
      }
    }
  });

  it('does not convert between pixels and millimetres', () => {
    // `pxPerMm` may be stored and range-checked; multiplying by it is P02.
    for (const file of PRODUCTION) {
      const source = read(file);
      expect(source).not.toMatch(/[*/]\s*\w*pxPerMm/);
      expect(source).not.toMatch(/pxPerMm\s*[*/]/);
    }
  });
});

describe('nothing out of scope is serialized', () => {
  it('defines no watermark, export or download field', () => {
    for (const file of PRODUCTION) {
      const source = read(file).toLowerCase();
      for (const token of ['watermark', 'downloadurl', 'exporturl', 'objecturl']) {
        // The word may appear in prose explaining why it is absent, so only
        // declarations count.
        expect(source).not.toMatch(new RegExp(`(readonly|const|let)\\s+\\w*${token}`));
      }
    }
  });

  it('defines no storage key, private URL or session secret field', () => {
    for (const file of PRODUCTION) {
      const source = read(file);
      for (const token of [
        'storageKey',
        'sourceUrl',
        'originalUrl',
        'sessionSecret',
        'previewUrl',
      ]) {
        expect(source).not.toMatch(new RegExp(`readonly\\s+${token}`));
      }
    }
  });

  it('implements no API operation, repository or worker job', () => {
    for (const file of PRODUCTION) {
      const source = read(file);
      for (const token of ['@Controller', '@Injectable', '@Module', '@Get(', '@Post(']) {
        expect(source).not.toContain(token);
      }
      // `upstreamRepository` is provenance metadata, so only a declaration counts.
      expect(source).not.toMatch(/(class|interface)\s+\w*(Repository|JobHandler|Controller)\b/);
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
