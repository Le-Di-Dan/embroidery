/**
 * Regressions for the `APP3-F01` controlled-font gate.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * evidence and proves the checker refuses it. Nothing here writes into tracked
 * authority and nothing here parses WOFF2 — glyph coverage was measured once by
 * a pinned FontTools run, and re-measuring it with an unreviewed parser would
 * defeat the point of pinning the tool.
 *
 * The cases worth reading twice are the ones that attack the *evidence* rather
 * than the binaries: a coverage manifest bound to hashes that are not the
 * committed ones, and a required repertoire quietly shrunk so that "0 missing"
 * becomes trivially true. A gate that only compared a manifest against itself
 * would pass both.
 */
import { strict as assert } from 'node:assert';
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  FONT_DIR,
  FONT_FILES,
  P01_ENTRY,
  PHASE_FILE,
  REPO_ROOT,
  REQUIRED_FILES,
  checkApp3F01,
  mandatedCodePoints,
} from './check-app3-f01-font-assets.mjs';

const PROVENANCE = `${FONT_DIR}/FONT-PROVENANCE.json`;
const COVERAGE = `${FONT_DIR}/VIETNAMESE-COVERAGE.json`;
const README = `${FONT_DIR}/README.md`;

/** Files the gate reads. Binaries are copied as bytes, never as text. */
const TRACKED = [
  ...REQUIRED_FILES.map((name) => `${FONT_DIR}/${name}`),
  `${FONT_DIR}/.gitattributes`,
  PHASE_FILE,
  P01_ENTRY,
];

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `node:test` runs subtests sequentially, so applying an edit and putting the
 * original back is safe, and it avoids re-copying 740 KB of font binary per
 * case.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-f01-'));
  temporaries.push(base);
  for (const relative of TRACKED) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  return base;
}

/** Runs the gate against the shared root with `edits` applied, then restores. */
function run(edits = {}, extras = []) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, content] of Object.entries(edits)) {
    if (content === null) {
      rmSync(join(dir, relative), { force: true });
      continue;
    }
    writeFileSync(join(dir, relative), content, 'utf8');
  }
  for (const [relative, content] of extras) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), content);
  }
  try {
    return checkApp3F01(dir);
  } finally {
    for (const relative of touched) cpSync(join(REPO_ROOT, relative), join(dir, relative));
    for (const [relative] of extras) rmSync(join(dir, relative), { force: true });
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

const provenance = () => json(PROVENANCE);
const coverage = () => json(COVERAGE);
const write = (value) => JSON.stringify(value, null, 2);

describe('APP3-F01 — the committed repository passes', () => {
  it('accepts the delivered Inter v4.1 evidence', () => {
    assert.deepEqual(checkApp3F01(REPO_ROOT), []);
  });

  it('accepts the throwaway copy of it, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-F01 — the binaries must be present and unmodified', () => {
  for (const name of FONT_FILES) {
    it(`rejects a missing ${name}`, () => {
      const failures = run({ [`${FONT_DIR}/${name}`]: null });
      assert.ok(mentions(failures, `${name} is missing`), failures.join('\n'));
    });
  }

  it('rejects a modified binary, because the recorded hash becomes fiction', () => {
    const dir = baseRoot();
    const target = join(dir, FONT_DIR, 'InterVariable.woff2');
    try {
      appendFileSync(target, Buffer.from([0x00]));
      const failures = checkApp3F01(dir);
      assert.ok(mentions(failures, 'InterVariable.woff2 hashes'), failures.join('\n'));
      assert.ok(mentions(failures, 'InterVariable.woff2 is 352241 bytes'), failures.join('\n'));
    } finally {
      cpSync(join(REPO_ROOT, FONT_DIR, 'InterVariable.woff2'), target);
    }
  });

  it('rejects a byte size that does not describe the committed file', () => {
    const value = provenance();
    value.files[0].byteSize = 999;
    const failures = run({ [PROVENANCE]: write(value) });
    assert.ok(mentions(failures, 'records 999'), failures.join('\n'));
  });

  it('rejects a rewritten licence, which is no longer the OFL', () => {
    const failures = run({ [`${FONT_DIR}/LICENSE.txt`]: 'Copyright. All rights reserved.\n' });
    assert.ok(mentions(failures, 'LICENSE.txt hashes'), failures.join('\n'));
  });

  it('rejects losing the line-ending protection the recorded hashes depend on', () => {
    // Root `.gitattributes` is `* text=auto eol=lf`; upstream LICENSE.txt is
    // CRLF. Drop the local `-text` override and a clean clone hashes
    // differently while every diff still looks untouched.
    const failures = run({ [`${FONT_DIR}/.gitattributes`]: '# nothing\n' });
    assert.ok(mentions(failures, '.gitattributes'), failures.join('\n'));
  });

  it('rejects an extra font binary the audit never saw', () => {
    const failures = run({}, [[`${FONT_DIR}/Extra.woff2`, Buffer.from('not audited')]]);
    assert.ok(mentions(failures, 'Extra.woff2 is a font binary'), failures.join('\n'));
  });

  it('rejects a font binary vendored outside the controlled directory', () => {
    const failures = run({}, [['packages/design-document/src/Sneaky.ttf', Buffer.from('x')]]);
    assert.ok(mentions(failures, 'outside the controlled directory'), failures.join('\n'));
  });
});

describe('APP3-F01 — provenance must stay pinned to the audited release', () => {
  for (const [field, wrong] of [
    ['family', 'General Sans'],
    ['upstreamRepository', 'https://cdn.example.test/inter'],
    ['upstreamTag', 'latest'],
    ['upstreamCommit', 'f'.repeat(40)],
    ['licenseSpdx', 'MIT'],
  ]) {
    it(`rejects a drifted ${field}`, () => {
      const value = provenance();
      value[field] = wrong;
      const failures = run({ [PROVENANCE]: write(value) });
      assert.ok(mentions(failures, field), failures.join('\n'));
    });
  }

  it('rejects a font sourced from node_modules', () => {
    const value = provenance();
    value.verification.acquisitionMethod = 'copied from node_modules/.pnpm/next/font';
    const failures = run({ [PROVENANCE]: write(value) });
    assert.ok(mentions(failures, 'forbidden font source'), failures.join('\n'));
  });

  it('rejects a font sourced from a Google Fonts CDN', () => {
    const value = provenance();
    value.verification.acquisitionMethod = 'https://fonts.gstatic.com/s/inter/v4.1';
    const failures = run({ [PROVENANCE]: write(value) });
    assert.ok(mentions(failures, 'forbidden font source'), failures.join('\n'));
  });
});

describe('APP3-F01 — upright and italic stay distinct roles', () => {
  it('rejects collapsing both files onto one style', () => {
    const value = provenance();
    // Italic reported as upright: the registry could no longer resolve italic.
    value.files[1].style = 'normal';
    const failures = run({ [PROVENANCE]: write(value) });
    assert.ok(mentions(failures, 'style "italic"'), failures.join('\n'));
    assert.ok(mentions(failures, 'distinct styles'), failures.join('\n'));
  });

  it('rejects measured metadata that makes the upright file italic', () => {
    const value = provenance();
    value.verification.metadata[0].fsSelectionItalicBit = true;
    const failures = run({ [PROVENANCE]: write(value) });
    assert.ok(mentions(failures, 'upright file is not italic'), failures.join('\n'));
  });

  it('rejects measured metadata that makes the italic file upright', () => {
    const value = provenance();
    value.verification.metadata[1].fsSelectionItalicBit = false;
    const failures = run({ [PROVENANCE]: write(value) });
    assert.ok(mentions(failures, 'italic file is italic'), failures.join('\n'));
  });
});

describe('APP3-F01 — coverage evidence must be about these exact bytes', () => {
  it('rejects coverage measured against different bytes', () => {
    const value = coverage();
    value.files[0].sha256 = 'a'.repeat(64);
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'not the provenance hash'), failures.join('\n'));
  });

  it('rejects a missing Vietnamese code point', () => {
    const value = coverage();
    // U+1EC7 ệ — one of the commonest letters in Vietnamese.
    value.files[1].missingCodePoints = ['U+1EC7'];
    value.files[1].coveredCodePointCount -= 1;
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'U+1EC7'), failures.join('\n'));
  });

  it('rejects a covered count that does not reach the required count', () => {
    const value = coverage();
    value.files[0].coveredCodePointCount -= 1;
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'required code points'), failures.join('\n'));
  });

  it('rejects a repertoire shrunk so that "0 missing" becomes trivial', () => {
    // The attack a self-consistent manifest survives: keep every claim true,
    // but require almost nothing. The gate re-derives the mandate itself.
    const value = coverage();
    value.requiredRepertoire.codePoints = ['U+0041', 'U+0042'];
    value.requiredCodePointCount = 2;
    for (const file of value.files) {
      file.requiredCodePointCount = 2;
      file.coveredCodePointCount = 2;
    }
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'mandated code point'), failures.join('\n'));
  });

  it('rejects dropping the combining marks alone', () => {
    const value = coverage();
    const dropped = new Set(['U+0300', 'U+0301', 'U+0303', 'U+0309', 'U+0323']);
    value.requiredRepertoire.codePoints = value.requiredRepertoire.codePoints.filter(
      (point) => !dropped.has(point),
    );
    value.requiredCodePointCount = value.requiredRepertoire.codePoints.length;
    for (const file of value.files) {
      file.requiredCodePointCount = value.requiredCodePointCount;
      file.coveredCodePointCount = value.requiredCodePointCount;
    }
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'U+0300'), failures.join('\n'));
  });

  it('rejects a required count that disagrees with the list it describes', () => {
    const value = coverage();
    value.requiredCodePointCount += 5;
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'but lists'), failures.join('\n'));
  });

  it('rejects coverage that does not name the tool that measured it', () => {
    const value = coverage();
    delete value.files[0].verificationToolVersion;
    const failures = run({ [COVERAGE]: write(value) });
    assert.ok(mentions(failures, 'tool and version'), failures.join('\n'));
  });

  it('mandates the full Vietnamese repertoire, not a sample', () => {
    const mandated = mandatedCodePoints();
    assert.equal(mandated.size, 156);
    for (const point of [0x0111, 0x01b0, 0x031b, 0x1ea0, 0x1ef9]) {
      assert.ok(mandated.has(point), `U+${point.toString(16)} must be mandated`);
    }
  });
});

describe('APP3-F01 — the README carries the reader to the evidence', () => {
  it('rejects a README that drops the provenance manifest', () => {
    const failures = run({ [README]: read(README).replaceAll('FONT-PROVENANCE.json', 'notes') });
    assert.ok(mentions(failures, 'FONT-PROVENANCE.json'), failures.join('\n'));
  });

  it('rejects a README that drops the Reserved Font Name obligation', () => {
    const failures = run({ [README]: read(README).replaceAll('Reserved Font Name', 'name') });
    assert.ok(mentions(failures, 'Reserved Font Name'), failures.join('\n'));
  });

  it('rejects a README that no longer states the binaries are unmodified', () => {
    const text = read(README)
      .replaceAll('not modified', 'adjusted')
      .replaceAll('unmodified', 'adjusted')
      .replaceAll('byte-identical', 'similar');
    const failures = run({ [README]: text });
    assert.ok(mentions(failures, 'unmodified'), failures.join('\n'));
  });
});

describe('APP3-F01 — the phase authority must record the split', () => {
  it('rejects a phase plan that does not block P01 on F01 acceptance', () => {
    const text = read(PHASE_FILE).replaceAll('BLOCKED_BY_APP3-F01_REVIEW_ACCEPTANCE', 'READY');
    const failures = run({ [PHASE_FILE]: text });
    assert.ok(mentions(failures, 'review acceptance'), failures.join('\n'));
  });

  it('rejects a phase plan that forgets why the first P01 attempt failed', () => {
    const text = read(PHASE_FILE).replaceAll(
      'NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE',
      'NONE',
    );
    const failures = run({ [PHASE_FILE]: text });
    assert.ok(mentions(failures, 'failed APP3-P01 first attempt'), failures.join('\n'));
  });

  it('rejects a phase plan that marks APP3-P01 complete', () => {
    const text = read(PHASE_FILE).replace(
      'APP3-P01 = BLOCKED_BY_APP3-F01_REVIEW_ACCEPTANCE',
      'APP3-P01 = COMPLETE — REVIEW_DELIVERED',
    );
    const failures = run({ [PHASE_FILE]: text });
    assert.ok(mentions(failures, 'marks APP3-P01 complete'), failures.join('\n'));
  });

  it('rejects P01 implementation started under cover of this checkpoint', () => {
    const failures = run({ [P01_ENTRY]: 'export const FONT_REGISTRY = { inter: {} };\n' });
    assert.ok(mentions(failures, 'no longer an empty stub'), failures.join('\n'));
  });
});
