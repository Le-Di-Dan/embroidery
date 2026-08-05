/**
 * Regressions for the `APP3-W01B` grammar gate.
 *
 * The policy half: allowlists, value and path grammar, ceilings, canonical
 * output and the corpus. Each case breaks exactly one ruled property in a
 * throwaway copy of the repository and proves the checker refuses it. Two of
 * these found real gate weaknesses when they were written — `maxDepth: 64`
 * matching inside `maxDepth: 640`, and a namespace check satisfied by a
 * different statement than the one deleted — which is the whole reason a gate
 * gets its own regression suite.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as B01_FILES } from './check-app3-b01.mjs';
import { CANONICAL_FILES as B01N_FILES } from './check-app3-b01n.mjs';
import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { CANONICAL_FILES as G05_FILES } from './check-app3-g05.mjs';
import { CANONICAL_FILES as G06_FILES } from './check-app3-g06.mjs';
import { CANONICAL_FILES as G07_FILES } from './check-app3-g07.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { CANONICAL_FILES as W01A_FILES } from './check-app3-w01a.mjs';
import { CANONICAL_FILES as BOUNDARY_FILES } from './check-app3-w01b-boundaries.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { CANONICAL_FILES, EXACT_PINS, REPO_ROOT, checkApp3W01B } from './check-app3-w01b.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-W01B` chains W01A and G07, and W01A chains G06 → B01 → P02 → G05 → P01 →
 * F01/DB01 → G04 → G03 → G02 → G01, so the root needs every canonical file those
 * gates read plus real `.git` history for G01's chronology half. `node_modules`
 * is **not** copied: the engines check reads it from the real repository, and
 * copying a dependency tree per test run would cost more than the whole suite.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-w01b-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(BOUNDARY_FILES),
    ...Object.values(W01A_FILES),
    ...Object.values(G07_FILES),
    ...Object.values(G06_FILES),
    ...Object.values(B01_FILES),
    ...Object.values(B01N_FILES),
    ...Object.values(P02_FILES),
    ...Object.values(G05_FILES),
    ...Object.values(DB01_FILES),
    ...Object.values(G01_FILES),
    ...Object.values(G02_FILES),
    ...Object.values(G03_FILES),
    ...Object.values(G04_FILES),
    ...REQUIRED_FILES.map((name) => `${FONT_DIR}/${name}`),
    `${FONT_DIR}/.gitattributes`,
    `${DOCUMENT_PACKAGE}/package.json`,
  ]);
  for (const relative of canonical) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  for (const directory of [
    'apps/api/src',
    'apps/worker/src',
    'apps/worker/test',
    'packages/design-engine/src',
    'packages/domain-types/src',
    DOCUMENT_SRC,
    'packages/database/migrations',
    '.git',
  ]) {
    cpSync(join(REPO_ROOT, directory), join(base, directory), { recursive: true });
  }
  return base;
}

/** Runs the gate against the shared root with `edits` applied, then restores. */
function run(edits = {}) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, content] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), content, 'utf8');
  }
  try {
    return checkApp3W01B(dir);
  } finally {
    for (const relative of touched) {
      try {
        cpSync(join(REPO_ROOT, relative), join(dir, relative));
      } catch {
        rmSync(join(dir, relative), { force: true });
      }
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const file = (key) => read(CANONICAL_FILES[key]);
const boundaryFile = (key) => read(BOUNDARY_FILES[key]);
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** The worker manifest with one dependency changed or added. */
function manifestWith(changes) {
  const manifest = JSON.parse(file('workerManifest'));
  manifest.dependencies = { ...manifest.dependencies, ...changes };
  return `${JSON.stringify(manifest, undefined, 2)}\n`;
}

describe('APP3-W01B — the allowlists are closed', () => {
  it('rejects adding a tenth element', () => {
    const failures = run({
      [CANONICAL_FILES.svgPolicy]: file('svgPolicy').replace("'polygon',", "'polygon',\n  'text',"),
    });
    assert.ok(mentions(failures, 'IMP-D047 locks 9'), failures.join('\n'));
  });

  it('rejects removing an element the ruling names', () => {
    const failures = run({
      [CANONICAL_FILES.svgPolicy]: file('svgPolicy').replace("  'ellipse',\n", ''),
    });
    assert.ok(mentions(failures, 'omits "ellipse"'), failures.join('\n'));
  });

  it('rejects widening the root attribute pair', () => {
    const failures = run({
      [CANONICAL_FILES.svgPolicy]: file('svgPolicy').replace(
        "TEMPLATE_SVG_ROOT_ATTRIBUTES = ['xmlns', 'viewBox']",
        "TEMPLATE_SVG_ROOT_ATTRIBUTES = ['xmlns', 'viewBox', 'width']",
      ),
    });
    assert.ok(mentions(failures, 'not exactly xmlns and viewBox'), failures.join('\n'));
  });

  for (const attribute of ['id', 'class', 'style', 'href']) {
    it(`rejects admitting "${attribute}"`, () => {
      const failures = run({
        [CANONICAL_FILES.svgPolicy]: file('svgPolicy').replace(
          "  'opacity',\n",
          `  'opacity',\n  '${attribute}',\n`,
        ),
      });
      assert.ok(mentions(failures, `"${attribute}" appears`), failures.join('\n'));
    });
  }

  it('rejects dropping the namespace requirement', () => {
    const failures = run({
      [CANONICAL_FILES.builder]: file('builder').replace(
        'if (element.namespaceURI !== SVG_NAMESPACE) return undefined;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'does not require the SVG namespace'), failures.join('\n'));
  });

  it('rejects admitting namespaced attributes, which is the xlink door', () => {
    const failures = run({
      // Only the child-attribute statement; the root reader's own namespace
      // comparison stays, which is what makes this a real regression case.
      [CANONICAL_FILES.builder]: file('builder').replace(
        '    if (attribute.namespaceURI !== null) return undefined;\n',
        '',
      ),
    });
    assert.ok(mentions(failures, 'does not reject namespaced attributes'), failures.join('\n'));
  });
});

describe('APP3-W01B — every value has a real parser', () => {
  it('rejects passing an unvalidated attribute through', () => {
    const failures = run({
      [CANONICAL_FILES.values]: file('values').replace(
        'return validator === undefined ? undefined : validator(value);',
        'return validator === undefined ? value : validator(value);',
      ),
    });
    assert.ok(mentions(failures, 'no validator is not rejected'), failures.join('\n'));
  });

  it('rejects a fractional viewBox dimension', () => {
    const failures = run({
      [CANONICAL_FILES.values]: file('values').replace(
        'if (!Number.isInteger(width) || !Number.isInteger(height)) return undefined;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'integer dimensions'), failures.join('\n'));
  });

  it('rejects reading arc flags as ordinary numbers', () => {
    const failures = run({
      [CANONICAL_FILES.tokenizer]: file('tokenizer').replaceAll('readFlag()', 'readAnyNumber()'),
    });
    assert.ok(mentions(failures, 'arc flags are not read'), failures.join('\n'));
  });

  it('rejects dropping moveto continuation', () => {
    const failures = run({
      [CANONICAL_FILES.pathParser]: file('pathParser').replaceAll(
        'MOVETO_CONTINUATION',
        'NO_CONTINUATION',
      ),
    });
    assert.ok(mentions(failures, 'moveto continuation'), failures.join('\n'));
  });

  it('rejects dropping a command family from the grammar', () => {
    const failures = run({
      [CANONICAL_FILES.pathParser]: file('pathParser').replace(/^\s*A: 7,$/m, ''),
    });
    assert.ok(mentions(failures, 'no arity for "A"'), failures.join('\n'));
  });

  it('rejects an external path-parser dependency', () => {
    const failures = run({
      [CANONICAL_FILES.workerManifest]: manifestWith({ 'svg-path-parser': '1.1.0' }),
    });
    assert.ok(mentions(failures, 'package-owned one'), failures.join('\n'));
  });
});

describe('APP3-W01B — the ceilings hold and nothing is truncated', () => {
  for (const [from, to, complaint] of [
    ['maxSourceBytes: 1024 * 1024', 'maxSourceBytes: 8 * 1024 * 1024', '1 MiB source ceiling'],
    ['maxElements: 10_000', 'maxElements: 100_000', 'the 10,000-element ceiling'],
    ['maxPathDataChars: 1_000_000', 'maxPathDataChars: 9_000_000', 'the 1,000,000-character'],
    ['maxDepth: 64', 'maxDepth: 640', 'the depth ceiling of 64'],
    ['maxWidth: 4096', 'maxWidth: 8192', 'the 4096 viewBox width'],
    ['maxPixels: 16_777_216', 'maxPixels: 67_108_864', 'the 16,777,216 pixel budget'],
  ]) {
    it(`rejects widening ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.svgPolicy]: file('svgPolicy').replace(from, to),
      });
      assert.ok(mentions(failures, complaint), failures.join('\n'));
    });
  }

  it('rejects a builder that stops enforcing depth', () => {
    const failures = run({
      [CANONICAL_FILES.builder]: file('builder').replace(
        'if (depth > TEMPLATE_SVG_LIMITS.maxDepth) return undefined;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'does not enforce the depth ceiling'), failures.join('\n'));
  });

  it('rejects enforcing the byte ceiling only after decoding', () => {
    const failures = run({
      [CANONICAL_FILES.sourceForm]: file('sourceForm').replace(
        'if (bytes.length > TEMPLATE_SVG_LIMITS.maxSourceBytes) return REJECTED;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'not enforced before decoding'), failures.join('\n'));
  });

  it('rejects a non-fatal UTF-8 decode, which would invent content', () => {
    const failures = run({
      [CANONICAL_FILES.sourceForm]: file('sourceForm').replace('fatal: true', 'fatal: false'),
    });
    assert.ok(mentions(failures, 'UTF-8 decoding is not fatal'), failures.join('\n'));
  });

  it('rejects admitting DOCTYPE and processing instructions by form', () => {
    const failures = run({
      [CANONICAL_FILES.sourceForm]: file('sourceForm').replace(
        "FORBIDDEN_MARKUP = ['<!', '<?']",
        "FORBIDDEN_MARKUP = ['<!ENTITY']",
      ),
    });
    assert.ok(mentions(failures, 'are not refused by form'), failures.join('\n'));
  });
});

describe('APP3-W01B — DOMPurify is configured, never trusted to decide', () => {
  for (const [from, to, complaint] of [
    ['ALLOW_DATA_ATTR: false', 'ALLOW_DATA_ATTR: true', 'the data-attribute refusal'],
    ['ALLOW_ARIA_ATTR: false', 'ALLOW_ARIA_ATTR: true', 'the ARIA-attribute refusal'],
    ['ALLOW_UNKNOWN_PROTOCOLS: false', 'ALLOW_UNKNOWN_PROTOCOLS: true', 'the unknown-protocol'],
    ['NAMESPACE: SVG_NAMESPACE', 'NAMESPACE: HTML_NAMESPACE', 'the SVG namespace'],
    ['PARSER_MEDIA_TYPE: XML_MEDIA_TYPE', "PARSER_MEDIA_TYPE: 'text/html'", 'XML parsing'],
    ['ADD_URI_SAFE_ATTR: []', "ADD_URI_SAFE_ATTR: ['href']", 'the empty URI-safe exception list'],
  ]) {
    it(`rejects losing ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.purifier]: file('purifier').replace(from, to),
      });
      assert.ok(mentions(failures, complaint), failures.join('\n'));
    });
  }

  it('rejects relying on a DOMPurify profile instead of explicit lists', () => {
    const failures = run({
      [CANONICAL_FILES.purifier]: file('purifier').replace(
        'RETURN_DOM: true,',
        'RETURN_DOM: true,\n    USE_PROFILES: { svg: true },',
      ),
    });
    assert.ok(mentions(failures, 'relies on a DOMPurify profile'), failures.join('\n'));
  });

  it('rejects making DOMPurify.removed the security decision', () => {
    // PO-02: the library reports what it stripped; the repository's own
    // validation decides. Branching on `removed` inverts that.
    const failures = run({
      [CANONICAL_FILES.pipeline]: file('pipeline').replace(
        'if (!canonicalDocumentsEqual(validated, sanitized)) return undefined;',
        'if (purify.removed.length > 0) return undefined;',
      ),
    });
    assert.ok(mentions(failures, 'diagnostic only'), failures.join('\n'));
  });
});

describe('APP3-W01B — reject on removal, and the fixed point behind it', () => {
  it('rejects dropping the structural comparison', () => {
    const failures = run({
      [CANONICAL_FILES.pipeline]: file('pipeline').replace(
        'if (!canonicalDocumentsEqual(validated, sanitized)) return undefined;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'does not compare the validated'), failures.join('\n'));
  });

  it('rejects building the post-sanitize model with a second, laxer reader', () => {
    const failures = run({
      [CANONICAL_FILES.pipeline]: file('pipeline').replace(
        'const sanitized = withSanitizedSvgRoot(source.text, buildCanonicalSvgDocument);',
        'const sanitized = validated;',
      ),
    });
    assert.ok(mentions(failures, 'sanitized structure is not rebuilt'), failures.join('\n'));
  });

  it('rejects dropping the second pass', () => {
    const failures = run({
      [CANONICAL_FILES.pipeline]: file('pipeline').replace(
        'const second = runPass(first.bytes);',
        'const second = first;',
      ),
    });
    assert.ok(mentions(failures, 'does not re-run itself'), failures.join('\n'));
  });

  it('rejects dropping the byte equality that makes the second pass mean anything', () => {
    const failures = run({
      [CANONICAL_FILES.pipeline]: file('pipeline').replace(
        'if (!first.bytes.equals(second.bytes)) return undefined;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'two serializations to be identical'), failures.join('\n'));
  });

  it('rejects an optimizer inside the pipeline', () => {
    // PO-03: DOMPurify's own documentation warns that modifying markup after
    // sanitizing can void the sanitization.
    const failures = run({
      [CANONICAL_FILES.pipeline]: `${file('pipeline')}\nconst _later = svgo.optimize;\n`,
    });
    assert.ok(mentions(failures, 'runs inside the pipeline'), failures.join('\n'));
  });
});

describe('APP3-W01B — the canonical output form', () => {
  it('rejects emitting an XML declaration', () => {
    const failures = run({
      [CANONICAL_FILES.serializer]: file('serializer').replace(
        'return parts.join(',
        'parts.unshift(\'<?xml version="1.0"?>\');\n  return parts.join(',
      ),
    });
    assert.ok(mentions(failures, 'an XML declaration, a BOM or a newline'), failures.join('\n'));
  });

  it('rejects dropping attribute escaping', () => {
    const failures = run({
      [CANONICAL_FILES.serializer]: file('serializer').replaceAll(
        'escapeAttributeValue',
        'passThrough',
      ),
    });
    assert.ok(mentions(failures, 'not XML-escaped'), failures.join('\n'));
  });

  it('rejects unsorted attributes, which would make output depend on input order', () => {
    const failures = run({
      [CANONICAL_FILES.builder]: file('builder').replace(
        /return attributes\.sort\([^;]*\);/,
        'return attributes;',
      ),
    });
    assert.ok(mentions(failures, 'not sorted deterministically'), failures.join('\n'));
  });

  it('rejects copying the xmlns attribute instead of synthesizing it', () => {
    const failures = run({
      [CANONICAL_FILES.builder]: file('builder').replace(
        '{ name: XMLNS, value: SVG_NAMESPACE }',
        '{ name: XMLNS, value: viewBox }',
      ),
    });
    assert.ok(mentions(failures, 'not synthesized from the namespace'), failures.join('\n'));
  });
});

describe('APP3-W01B — the corpus is real', () => {
  for (const [needle, complaint] of [
    ['<script>', 'scripts'],
    ['foreignObject', 'foreign content'],
    ['ENTITY', 'XXE payloads'],
    ['ownerDocument', 'DOM clobbering'],
    ['mXSS', 'mutation-XSS'],
  ]) {
    it(`rejects a rejection corpus with no coverage of ${complaint}`, () => {
      const failures = run({
        [CANONICAL_FILES.rejectionCorpus]: file('rejectionCorpus').replaceAll(needle, 'REMOVED'),
      });
      assert.ok(mentions(failures, `does not cover ${complaint}`), failures.join('\n'));
    });
  }

  it('rejects an acceptance corpus that leans on a snapshot', () => {
    const failures = run({
      [CANONICAL_FILES.acceptanceCorpus]: `${file('acceptanceCorpus')}\n// toMatchSnapshot\n`,
    });
    assert.ok(mentions(failures, 'relies on a snapshot'), failures.join('\n'));
  });

  it('rejects losing the fixed-point assertion from the corpus', () => {
    const failures = run({
      [CANONICAL_FILES.acceptanceCorpus]: file('acceptanceCorpus').replaceAll(
        're-canonicalizes its own output',
        'does something',
      ),
    });
    assert.ok(mentions(failures, 'does not assert the fixed point'), failures.join('\n'));
  });

  it('rejects a determinism proof that never enters the container', () => {
    const failures = run({
      [CANONICAL_FILES.determinism]: file('determinism').replaceAll(
        "toBe('v22.14.0')",
        'toBeDefined()',
      ),
    });
    assert.ok(mentions(failures, 'the locked container Node'), failures.join('\n'));
  });

  it('rejects a determinism proof that drops cross-platform identity', () => {
    const failures = run({
      [CANONICAL_FILES.determinism]: file('determinism').replaceAll(
        'byte-identical output on Alpine Linux',
        'something on Linux',
      ),
    });
    assert.ok(mentions(failures, 'cross-platform byte identity'), failures.join('\n'));
  });
});
