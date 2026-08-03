/**
 * Regression tests for the lifecycle-authority consistency gate.
 *
 * Each mutation reproduces a real failure mode: the state the repository was
 * actually in when `APP2-B03` blocked, and the three ways that state could come
 * back. The corrected repository is checked against its real files, not a
 * fixture, so the gate cannot pass its own tests while failing the repository.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  APP2_AUDIT,
  APP2_PHASE_PLAN,
  checkLifecycleConsistency,
  claimsBidirectionalProductLifecycle,
  claimsUnpublishArchives,
  COMPLETENESS_MATRIX,
  LIFECYCLE_SPEC,
  parseDeclaredCount,
  parseLc04Transitions,
} from './check-lifecycle-consistency.mjs';

function readRepository() {
  const files = {};
  for (const path of [LIFECYCLE_SPEC, COMPLETENESS_MATRIX, APP2_AUDIT, APP2_PHASE_PLAN]) {
    files[path] = readFileSync(path, 'utf8');
  }
  return files;
}

const UNPUBLISH_ROW =
  '| TR-LC04-05 | PUBLISHED→DRAFT | admin | current status is `PUBLISHED`; concurrency token matches | delist event; returns to the editable draft state | yes |';

test('the corrected repository passes', () => {
  assert.deepEqual(checkLifecycleConsistency(readRepository()), []);
});

test('LC-04 has exactly six transitions, one unpublish and one archive-from-draft', () => {
  const transitions = parseLc04Transitions(readFileSync(LIFECYCLE_SPEC, 'utf8'));
  assert.equal(transitions.length, 6);
  const unpublish = transitions.filter((t) => t.from === 'PUBLISHED' && t.to === 'DRAFT');
  assert.equal(unpublish.length, 1);
  assert.equal(unpublish[0].id, 'TR-LC04-05');
  // TR-LC04-06 (IMP-D042) authorises what APP2-B02 already shipped.
  const archiveDraft = transitions.filter((t) => t.from === 'DRAFT' && t.to === 'ARCHIVED');
  assert.equal(archiveDraft.length, 1);
  assert.equal(archiveDraft[0].id, 'TR-LC04-06');
  assert.notEqual(unpublish[0].id, archiveDraft[0].id);
  assert.equal(parseDeclaredCount(readFileSync(COMPLETENESS_MATRIX, 'utf8')), 6);
});

test('removing DRAFT → ARCHIVED from LC-04 fails', () => {
  const files = readRepository();
  files[LIFECYCLE_SPEC] = files[LIFECYCLE_SPEC].split(/\r?\n/)
    .filter((line) => !line.startsWith('| TR-LC04-06 |'))
    .join('\n');
  const violations = checkLifecycleConsistency(files);
  assert.ok(violations.some((v) => v.includes('DRAFT → ARCHIVED')));
});

test('removing PUBLISHED → DRAFT from LC-04 fails', () => {
  const files = readRepository();
  files[LIFECYCLE_SPEC] = files[LIFECYCLE_SPEC].split(/\r?\n/)
    .filter((line) => !line.startsWith('| TR-LC04-05 |'))
    .join('\n');
  const violations = checkLifecycleConsistency(files);
  assert.ok(violations.some((v) => v.includes('no PUBLISHED → DRAFT transition')));
  // The APP2 documents that claim DRAFT↔PUBLISHED are reported too — that pairing
  // is the exact contradiction APP2-B03 blocked on.
  assert.ok(violations.some((v) => v.includes(APP2_AUDIT)));
});

test('reverting the declared count to 5 fails', () => {
  const files = readRepository();
  files[COMPLETENESS_MATRIX] = files[COMPLETENESS_MATRIX].replace(
    '| LC-04 | CAT/AGG-06 | §LC-04 | 6 TR |',
    '| LC-04 | CAT/AGG-06 | §LC-04 | 5 TR |',
  );
  const violations = checkLifecycleConsistency(files);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes('declares LC-04 = 5 TR but'));
});

test('documenting the APP2 unpublish target as ARCHIVED fails', () => {
  const files = readRepository();
  files[APP2_PHASE_PLAN] += '\n\nAPP2-B03 unpublish is PUBLISHED → ARCHIVED.\n';
  const violations = checkLifecycleConsistency(files);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes('targeting ARCHIVED'));
});

test('duplicating the unpublish transition fails', () => {
  const files = readRepository();
  files[LIFECYCLE_SPEC] = files[LIFECYCLE_SPEC].replace(
    UNPUBLISH_ROW,
    `${UNPUBLISH_ROW}\n| TR-LC04-07 | PUBLISHED→DRAFT | admin | duplicate | — | yes |`,
  );
  const violations = checkLifecycleConsistency(files);
  assert.ok(violations.some((v) => v.includes('defines 2 PUBLISHED → DRAFT')));
  assert.ok(violations.some((v) => v.includes('declares LC-04 = 6 TR but')));
});

test('deleting the archive transition fails', () => {
  const files = readRepository();
  files[LIFECYCLE_SPEC] = files[LIFECYCLE_SPEC].split(/\r?\n/)
    .filter((line) => !line.startsWith('| TR-LC04-02 |'))
    .join('\n');
  assert.ok(checkLifecycleConsistency(files).some((v) => v.includes('archive as a distinct')));
});

test('ordinary prose about PUBLISHED and DRAFT is not a violation', () => {
  const prose = [
    'The list filter maps Bản nháp → DRAFT and Đã xuất bản → PUBLISHED.',
    'A DRAFT product is editable; a PUBLISHED product is publicly visible.',
    'Archive is PUBLISHED → ARCHIVED and unpublish is PUBLISHED → DRAFT.',
    'Unpublish is PUBLISHED → DRAFT; archive (PUBLISHED → ARCHIVED) is separate.',
    'Publishing an ARCHIVED product uses ARCHIVED → PUBLISHED.',
  ].join('\n');
  assert.equal(claimsUnpublishArchives(prose), false);
  assert.equal(claimsBidirectionalProductLifecycle(prose), false);

  const files = readRepository();
  files[APP2_PHASE_PLAN] += `\n\n${prose}\n`;
  assert.deepEqual(checkLifecycleConsistency(files), []);
});

test('a bidirectional claim is only a violation when the transition is absent', () => {
  assert.equal(claimsBidirectionalProductLifecycle('transition DRAFT↔PUBLISHED here'), true);
  // Present in the corrected repository, and therefore not reported.
  assert.deepEqual(checkLifecycleConsistency(readRepository()), []);
});

test('a missing LC-04 section is reported rather than silently passing', () => {
  const files = readRepository();
  files[LIFECYCLE_SPEC] = '# no lifecycles here';
  const violations = checkLifecycleConsistency(files);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes('no "## LC-04" section'));
});
