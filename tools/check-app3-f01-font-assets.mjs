#!/usr/bin/env node
/**
 * `APP3-F01` — controlled Inter font acquisition and authority.
 *
 * The first `APP3-P01` attempt stopped because the repository controlled no
 * font: no binary, no licence, no integrity baseline, no coverage evidence.
 * This gate guards the fix, and guards it from quietly rotting.
 *
 * Two failure modes pull in opposite directions. A binary can drift from the
 * evidence describing it — a re-encode, and the recorded hash becomes fiction.
 * Or the *evidence* can drift from what it should prove: a coverage manifest
 * reporting "0 missing" because its required repertoire quietly shrank to three
 * code points. So this gate hashes the committed bytes against the manifests
 * **and** re-derives the mandated Vietnamese repertoire itself.
 *
 * It deliberately does **not** parse WOFF2. Coverage was measured once from the
 * real `cmap` tables by a pinned FontTools run recorded in the evidence;
 * re-implementing a parser would swap a specified tool for an unreviewed one.
 *
 * Read-only. No network, no font parsing. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-f01-font-assets.mjs [rootDir]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Canonical home of the controlled family. Version is part of the path. */
export const FONT_DIR = 'packages/design-document/assets/fonts/inter/4.1';

export const REQUIRED_FILES = Object.freeze(
  (
    'InterVariable.woff2 InterVariable-Italic.woff2 LICENSE.txt ' +
    'FONT-PROVENANCE.json VIETNAMESE-COVERAGE.json README.md'
  ).split(' '),
);

/** Exactly these two binaries — an extra one is an unaudited font. */
export const FONT_FILES = Object.freeze(['InterVariable.woff2', 'InterVariable-Italic.woff2']);

const BINARY_EXTENSIONS = Object.freeze(['.woff2', '.woff', '.ttf', '.otf', '.eot', '.ttc']);

/** Values the human directive locked; none may drift silently. */
export const LOCKED = Object.freeze({
  family: 'Inter',
  upstreamRepository: 'https://github.com/rsms/inter',
  upstreamTag: 'v4.1',
  upstreamCommit: 'e3a3d4c57d5ecc01453a575621882a384c1995a3',
  licenseSpdx: 'OFL-1.1',
  licenseFile: 'LICENSE.txt',
  format: 'woff2',
  weightRange: '100..900',
});

export const PHASE_FILE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
export const P01_ENTRY = 'packages/design-document/src/index.ts';

/** Paths a controlled font may never come from. */
const SOURCES = 'node_modules fonts.googleapis.com fonts.gstatic.com cdn.jsdelivr.net unpkg.com';
const FORBIDDEN_SOURCES = Object.freeze(
  `${SOURCES} C:\\Windows\\Fonts /System/Library/Fonts /usr/share/fonts`.split(' '),
);

/**
 * The repertoire the directive mandates, re-derived here so a manifest cannot
 * satisfy the gate by shrinking what it claims to require.
 */
export function mandatedCodePoints() {
  const points = new Set();
  for (const text of ['ABCDĐEGHIKLMNOPQRSTUVXY', 'abcdđeghiklmnopqrstuvxy', 'ĂÂÊÔƠƯăâêôơư']) {
    for (const character of text) points.add(character.codePointAt(0));
  }
  // Canonical decomposition of Vietnamese needs each mark as its own glyph;
  // `Đ`/`đ` are separate letters, not accented forms.
  const marks = [0x0300, 0x0301, 0x0302, 0x0303, 0x0306, 0x0309, 0x031b, 0x0323];
  for (const cp of [...marks, 0x0110, 0x0111]) points.add(cp);
  for (let cp = 0x1ea0; cp <= 0x1ef9; cp += 1) points.add(cp);
  return points;
}

function hex(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function readJson(rootDir, relative, fail) {
  const path = join(rootDir, relative);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${relative} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** 1, 2 — the directory holds every required file and no unaudited binary. */
function checkFilePresence(rootDir, fail) {
  const directory = join(rootDir, FONT_DIR);
  if (!existsSync(directory)) {
    fail(`${FONT_DIR} does not exist — no controlled font is vendored`);
    return false;
  }
  let complete = true;
  for (const name of REQUIRED_FILES) {
    if (!existsSync(join(directory, name))) {
      fail(`${FONT_DIR}/${name} is missing`);
      complete = false;
    }
  }
  for (const entry of readdirSync(directory)) {
    const binary = BINARY_EXTENSIONS.some((ext) => entry.toLowerCase().endsWith(ext));
    if (binary && !FONT_FILES.includes(entry)) {
      fail(`${FONT_DIR}/${entry} is a font binary outside the audited pair`);
    }
  }
  return complete;
}

/** 3, 4, 6 — every committed byte matches the hash and size recorded for it. */
function checkIntegrity(rootDir, provenance, fail) {
  const entries = new Map((provenance.files ?? []).map((entry) => [entry.path, entry]));
  for (const name of FONT_FILES) {
    const entry = entries.get(name);
    if (entry === undefined) {
      fail(`FONT-PROVENANCE.json records no entry for ${name}`);
      continue;
    }
    const path = join(rootDir, FONT_DIR, name);
    if (!existsSync(path)) continue;

    const digest = sha256File(path);
    if (digest !== entry.sha256) {
      fail(`${name} hashes ${digest}, but FONT-PROVENANCE.json records ${entry.sha256}`);
    }
    const size = statSync(path).size;
    if (size !== entry.byteSize) {
      fail(`${name} is ${size} bytes, but FONT-PROVENANCE.json records ${entry.byteSize}`);
    }
    for (const key of ['format', 'weightRange']) {
      if (entry[key] !== LOCKED[key]) {
        fail(`${name} records ${key} "${String(entry[key])}", expected "${LOCKED[key]}"`);
      }
    }
  }

  // Root `.gitattributes` normalizes text to LF, and upstream LICENSE.txt is
  // CRLF — without a local override a clean checkout hashes differently.
  const attributes = join(rootDir, FONT_DIR, '.gitattributes');
  if (!existsSync(attributes) || !/^\s*\*\s+-text/m.test(readFileSync(attributes, 'utf8'))) {
    fail(`${FONT_DIR}/.gitattributes must disable text conversion with "* -text"`);
  }

  // The licence is evidence too: a summarised or rewritten OFL is not the OFL.
  const licence = provenance.licenseFile;
  const licencePath = join(rootDir, FONT_DIR, LOCKED.licenseFile);
  if (licence?.sha256 !== undefined && existsSync(licencePath)) {
    const digest = sha256File(licencePath);
    const size = statSync(licencePath).size;
    if (digest !== licence.sha256) {
      fail(`${LOCKED.licenseFile} hashes ${digest}, but provenance records ${licence.sha256}`);
    } else if (licence.byteSize !== undefined && size !== licence.byteSize) {
      fail(`${LOCKED.licenseFile} is ${size} bytes, but provenance records ${licence.byteSize}`);
    }
  }
}

/** 5, 9, 11 — locked provenance values, distinct roles, no forbidden source. */
function checkProvenance(rootDir, provenance, fail) {
  for (const [field, expected] of [
    ['family', LOCKED.family],
    ['upstreamRepository', LOCKED.upstreamRepository],
    ['upstreamTag', LOCKED.upstreamTag],
    ['upstreamCommit', LOCKED.upstreamCommit],
    ['licenseSpdx', LOCKED.licenseSpdx],
  ]) {
    if (provenance[field] !== expected) {
      fail(
        `FONT-PROVENANCE.json ${field} is "${String(provenance[field])}", expected "${expected}"`,
      );
    }
  }
  if (provenance.licenseFile?.path !== LOCKED.licenseFile) {
    fail(`FONT-PROVENANCE.json licenseFile.path must be ${LOCKED.licenseFile}`);
  }

  const styles = new Map((provenance.files ?? []).map((entry) => [entry.path, entry.style]));
  for (const [name, style] of [
    ['InterVariable.woff2', 'normal'],
    ['InterVariable-Italic.woff2', 'italic'],
  ]) {
    if (styles.get(name) !== style) fail(`${name} must be recorded as style "${style}"`);
  }
  // Collapsing the two roles onto one style would leave italic unresolvable.
  if (new Set(styles.values()).size !== styles.size) {
    fail('the upright and italic files must carry distinct styles');
  }

  const measured = provenance.verification?.metadata ?? [];
  const italicBits = new Map(measured.map((entry) => [entry.path, entry.fsSelectionItalicBit]));
  for (const [name, bit, complaint] of [
    ['InterVariable.woff2', false, 'the upright file is not italic'],
    ['InterVariable-Italic.woff2', true, 'the italic file is italic'],
  ]) {
    if (italicBits.get(name) !== bit) fail(`measured metadata must show ${complaint}`);
  }

  const serialized = JSON.stringify(provenance);
  for (const forbidden of FORBIDDEN_SOURCES) {
    if (serialized.includes(forbidden)) {
      fail(`FONT-PROVENANCE.json references a forbidden font source: ${forbidden}`);
    }
  }
}

/** 7, 8 — coverage is about these exact bytes, and nothing is missing. */
function checkCoverage(rootDir, provenance, coverage, fail) {
  const provenanceHashes = new Map(
    (provenance.files ?? []).map((entry) => [entry.path, entry.sha256]),
  );
  const files = coverage.files ?? [];
  if (files.length !== FONT_FILES.length) {
    fail(`VIETNAMESE-COVERAGE.json records ${files.length} file(s), expected ${FONT_FILES.length}`);
  }

  for (const name of FONT_FILES) {
    const entry = files.find((candidate) => candidate.path === name);
    if (entry === undefined) {
      fail(`VIETNAMESE-COVERAGE.json records no coverage for ${name}`);
      continue;
    }
    // Coverage measured against different bytes proves nothing about these.
    if (entry.sha256 !== provenanceHashes.get(name)) {
      fail(`coverage for ${name} references ${entry.sha256}, not the provenance hash`);
    }
    if (!Array.isArray(entry.missingCodePoints) || entry.missingCodePoints.length > 0) {
      fail(`coverage for ${name} reports missing code points: ${String(entry.missingCodePoints)}`);
    }
    const { coveredCodePointCount: covered, requiredCodePointCount: total } = entry;
    if (covered !== total) {
      fail(`coverage for ${name} covers ${covered} of ${total} required code points`);
    }
    if (entry.verificationTool === undefined || entry.verificationToolVersion === undefined) {
      fail(`coverage for ${name} does not name the tool and version that measured it`);
    }
  }

  const declared = new Set(
    (coverage.requiredRepertoire?.codePoints ?? []).map((value) =>
      Number.parseInt(String(value).replace(/^U\+/i, ''), 16),
    ),
  );
  const absent = [...mandatedCodePoints()].filter((cp) => !declared.has(cp));
  if (absent.length > 0) {
    const shown = absent.slice(0, 8).map(hex).join(', ');
    fail(`the required repertoire omits ${absent.length} mandated code point(s): ${shown}`);
  }
  if (coverage.requiredCodePointCount !== declared.size) {
    fail(
      `VIETNAMESE-COVERAGE.json claims ${coverage.requiredCodePointCount} required code points ` +
        `but lists ${declared.size}`,
    );
  }
  for (const entry of files) {
    if (entry.requiredCodePointCount !== coverage.requiredCodePointCount) {
      fail(`coverage for ${entry.path} uses a different required count than the manifest`);
    }
  }
}

/** 10 — the README carries the reader to the exact evidence, not a summary. */
function checkReadme(rootDir, fail) {
  const path = join(rootDir, FONT_DIR, 'README.md');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  const needles = ['FONT-PROVENANCE.json', 'VIETNAMESE-COVERAGE.json', 'SIL Open Font License 1.1'];
  needles.push('Reserved Font Name', LOCKED.licenseFile, LOCKED.upstreamTag);
  needles.push(LOCKED.upstreamCommit, LOCKED.upstreamRepository);
  for (const needle of needles) {
    if (!text.includes(needle)) fail(`${FONT_DIR}/README.md does not record "${needle}"`);
  }
  if (!/not\s+modified|unmodified|byte-identical/i.test(text)) {
    fail(`${FONT_DIR}/README.md does not state that the binaries are unmodified`);
  }
}

/** 11 — no font binary is vendored anywhere else in the working tree. */
function checkNoStrayBinaries(rootDir, fail) {
  const skip = new Set(['node_modules', '.git', '.turbo', 'dist', '.next', 'coverage']);
  const allowed = join(rootDir, FONT_DIR);
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(full);
      } else if (BINARY_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        if (!full.startsWith(allowed)) {
          fail(`font binary outside the controlled directory: ${full.slice(rootDir.length + 1)}`);
        }
      }
    }
  };
  walk(rootDir);
}

/**
 * 12, 13 — F01 is the recorded P01 prerequisite, and P01's state matches what
 * the phase plan says about it. Exactly **two** worlds are consistent: before
 * P01, an empty stub and a plan that blocks it; after P01, no stub, a plan that
 * says so, and a registry still pointing at *these* assets. A gate demanding the
 * stub forever would be deleted the day P01 landed — the defect `APP3-G04` was
 * rebuilt to avoid.
 */
function checkPhaseAuthority(rootDir, fail) {
  const text = readFileSync(join(rootDir, PHASE_FILE), 'utf8');
  for (const [token, complaint] of [
    ['APP3-F01', 'does not record APP3-F01'],
    [
      'NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE',
      'does not record the cause of the failed APP3-P01 first attempt',
    ],
  ]) {
    if (!text.includes(token)) fail(`the APP3 phase plan ${complaint}`);
  }

  const entry = join(rootDir, P01_ENTRY);
  const stubbed = /export\s*\{\s*\}/.test(existsSync(entry) ? readFileSync(entry, 'utf8') : '');

  if (!/APP3-P01\s*=\s*COMPLETE/.test(text)) {
    if (!text.includes('BLOCKED_BY_APP3-F01_REVIEW_ACCEPTANCE')) {
      fail('the APP3 phase plan does not block APP3-P01 on review acceptance');
    }
    if (!stubbed) {
      fail(`${P01_ENTRY} is no longer an empty stub while the phase plan still blocks APP3-P01`);
    }
    return;
  }
  if (stubbed) {
    fail('the APP3 phase plan records APP3-P01 as delivered, but the package is still a stub');
  }
  // P01 exists: F01's remaining job is that it still consumes these assets.
  const registry = join(rootDir, 'packages/design-document/src/fonts/registry.ts');
  const source = existsSync(registry) ? readFileSync(registry, 'utf8') : '';
  for (const name of [...FONT_FILES, LOCKED.licenseFile]) {
    if (!source.includes(name)) fail(`the delivered font registry does not reference ${name}`);
  }
}

export function checkApp3F01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const complete = checkFilePresence(rootDir, fail);
  const provenance = readJson(rootDir, `${FONT_DIR}/FONT-PROVENANCE.json`, fail);
  const coverage = readJson(rootDir, `${FONT_DIR}/VIETNAMESE-COVERAGE.json`, fail);

  if (complete && provenance !== undefined) {
    checkIntegrity(rootDir, provenance, fail);
    checkProvenance(rootDir, provenance, fail);
    if (coverage !== undefined) checkCoverage(rootDir, provenance, coverage, fail);
  }
  checkReadme(rootDir, fail);
  checkNoStrayBinaries(rootDir, fail);
  checkPhaseAuthority(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3F01(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-f01-font-assets — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-f01-font-assets — Inter v4.1 (rsms/inter@e3a3d4c, OFL-1.1) is vendored as two ' +
      'unmodified variable WOFF2 files whose committed bytes match their recorded SHA-256 and ' +
      'sizes; the licence is the exact upstream text; coverage evidence is bound to those same ' +
      'hashes and reports zero missing code points across the full mandated Vietnamese ' +
      'repertoire; upright and italic stay distinct roles; no font binary lives anywhere else; ' +
      'and the recorded APP3-P01 state matches the package on disk',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
