/**
 * Regressions for the `APP2-S02-C1` correction rules (IMP-D040).
 *
 * Each case copies the real canonical documents into a scratch tree and
 * introduces exactly one drift. These prove the gate would catch the mobile band
 * sliding back to the shell's 358px/16px, a measured 200 being described as an
 * HTTP 404, the `noindex` requirement disappearing, a Product canonical becoming
 * permissible on a not-found response, a proxy duplicate lookup being written
 * into authority, or the framework follow-up being closed by editing a word.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  EXPECTED,
  REPO_ROOT,
  checkProductDetailCorrection,
  correctionBlock,
  correctionFacts,
  decisionRow,
  duplicateLookupApprovals,
  falseStatusClaims,
  shellWidthClaims,
} from './check-storefront-product-detail-correction.mjs';

const scratchRoots = [];

after(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

function fixture(key, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'product-detail-correction-'));
  scratchRoots.push(root);
  for (const relative of Object.values(CANONICAL_FILES)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target);
  }
  if (key !== undefined) {
    const target = join(root, CANONICAL_FILES[key]);
    writeFileSync(target, mutate(readFileSync(target, 'utf8')));
  }
  return root;
}

function failuresFor(key, mutate) {
  return checkProductDetailCorrection(fixture(key, mutate)).join('\n');
}

const phaseText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.phase), 'utf8');

describe('check-storefront-product-detail-correction', () => {
  it('passes on the committed documents', () => {
    assert.deepEqual(checkProductDetailCorrection(), []);
  });

  it('rejects the mobile content width drifting back to the shell band', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail mobile content width` | `342px` |',
        '| `Product detail mobile content width` | `358px` |',
      ),
    );
    assert.match(failures, /`Product detail mobile content width` is "358px"/);
  });

  it('rejects the mobile gutter drifting back to the shell gutter', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Product detail mobile gutter` | `24px` |',
        '| `Product detail mobile gutter` | `16px` |',
      ),
    );
    assert.match(failures, /`Product detail mobile gutter` is "16px"/);
  });

  it('rejects describing the mobile column as filling the shell content width', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**Mobile content band.** At 390 the Product Detail content sits in a **342px** band',
        'The story column simply fills the available content width of 358px at 390, and sits in a band',
      ),
    );
    assert.match(failures, /describes the mobile column as filling the shell width/);
  });

  it('rejects calling the streamed 200 response an HTTP 404', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Streamed not-found classification` | `SAFE_STREAMED_NOT_FOUND` |',
        '| `Streamed not-found classification` | `HTTP_404` |',
      ),
    );
    assert.match(failures, /`Streamed not-found classification` is "HTTP_404"/);
  });

  it('rejects the forbidden 404 vocabulary in prose', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**HTTP 200** with a `noindex` signal. That is the framework',
        'a transport_404 response. That is the framework',
      ),
    );
    assert.match(failures, /calls the streamed 200 response a 404/);
  });

  it('rejects removing the noindex requirement', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Streamed not-found noindex` | `REQUIRED` |',
        '| `Streamed not-found noindex` | `OPTIONAL` |',
      ),
    );
    assert.match(failures, /`Streamed not-found noindex` is "OPTIONAL"/);
  });

  it('rejects permitting a Product canonical on a not-found response', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Streamed not-found product canonical` | `FORBIDDEN` |',
        '| `Streamed not-found product canonical` | `ALLOWED` |',
      ),
    );
    assert.match(failures, /`Streamed not-found product canonical` is "ALLOWED"/);
  });

  it('rejects approving a proxy duplicate lookup in the fact table', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Streamed not-found duplicate lookup` | `FORBIDDEN` |',
        '| `Streamed not-found duplicate lookup` | `REQUIRED` |',
      ),
    );
    assert.match(failures, /`Streamed not-found duplicate lookup` is "REQUIRED"/);
  });

  it('rejects approving a proxy duplicate lookup in prose', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '**No fabricated 404.** A proxy, middleware or custom-server preflight could force the status,',
        'A middleware preflight is required to force the status,',
      ),
    );
    assert.match(failures, /approves a proxy\/middleware duplicate lookup/);
  });

  it('rejects closing the framework follow-up by editing a word', () => {
    const failures = failuresFor('phase', (text) =>
      text.replace(
        '| `Exact 404 transport follow-up` | `ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1` |',
        '| `Exact 404 transport follow-up` | `RESOLVED` |',
      ),
    );
    assert.match(failures, /`Exact 404 transport follow-up` is "RESOLVED"/);
  });

  it('rejects unlocking or removing the decision row', () => {
    const failures = failuresFor('register', (text) =>
      text.replace(`| ${EXPECTED.decisionId} |`, '| IMP-D099 |'),
    );
    assert.match(failures, /no single `IMP-D040` row/);
  });

  it('rejects a decision row that permits fabricating the transport', () => {
    const failures = failuresFor('register', (text) =>
      text.replace('must not be fabricated', 'may be produced'),
    );
    assert.match(failures, /does not forbid fabricating the 404 transport/);
  });

  it('rejects losing the correction block entirely', () => {
    const failures = failuresFor('phase', (text) => text.replace('### 6.2.4 ', '### 6.2.9x '));
    assert.match(failures, /no `### 6\.2\.4` correction block/);
  });
});

describe('correction helpers', () => {
  it('bounds the correction block to its own section', () => {
    const block = correctionBlock(phaseText);
    assert.ok(block.includes('SAFE_STREAMED_NOT_FOUND'));
    assert.ok(!block.includes('## 7. Critical end-to-end journey'));
  });

  it('reads every machine-checked correction fact', () => {
    assert.equal(correctionFacts(correctionBlock(phaseText)).size, 8);
  });

  it('finds exactly one decision row', () => {
    const text = readFileSync(join(REPO_ROOT, CANONICAL_FILES.register), 'utf8');
    assert.ok(decisionRow(text)?.startsWith('| IMP-D040 |'));
  });

  it('keeps honest disclosure and historical prose legal', () => {
    // The whole point of the ruling is to say "this is 200, not 404" out loud.
    assert.deepEqual(
      falseStatusClaims('The streamed response is not a 404; it answers 200 with noindex.'),
      [],
    );
    assert.deepEqual(
      falseStatusClaims('Historically the S02 report recorded a streamed 404 expectation.'),
      [],
    );
    assert.deepEqual(
      shellWidthClaims('The story previously filled the shell content width of 358px; superseded.'),
      [],
    );
    assert.deepEqual(
      duplicateLookupApprovals('A middleware preflight must never be added to force the status.'),
      [],
    );
  });

  it('flags the same sentences without their labels', () => {
    assert.equal(falseStatusClaims('The streamed response is an HTTP_404.').length, 1);
    assert.equal(
      shellWidthClaims('The story column fills the shell content width of 358px.').length,
      1,
    );
    assert.equal(
      duplicateLookupApprovals('A middleware preflight is required for the status.').length,
      1,
    );
  });
});
