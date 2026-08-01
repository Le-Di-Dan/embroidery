/**
 * Regressions for the Q-01 pagination-authority gate (`APP2-B04-C1`).
 *
 * Each case copies the real canonical documents into a scratch tree and then
 * reintroduces exactly one of the drifts the correction closed. A gate that
 * only passes on today's text proves nothing; these prove it would have caught
 * the contradiction that shipped.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkPaginationAuthority,
  falseUnfilteredClaims,
  isHistoricalLine,
  sortTupleOf,
  unlabelledOffsetLines,
} from './check-pagination-authority.mjs';

const scratchRoots = [];

after(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

/** A copy of every canonical file, with `mutate` applied to one of them. */
function fixture(key, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'pagination-authority-'));
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
  return checkPaginationAuthority(fixture(key, mutate)).join('\n');
}

describe('check-pagination-authority', () => {
  it('passes on the committed documents', () => {
    assert.deepEqual(checkPaginationAuthority(), []);
  });

  it('rejects reverting the ADR Q-01 row to OFFSET', () => {
    const failures = failuresFor('adr', (text) =>
      text.replace('| Q-01 product listing | `KEYSET` |', '| Q-01 product listing | `OFFSET` |'),
    );
    assert.match(failures, /ADR-DB5-001 R5 classifies Q-01 as `OFFSET`/);
  });

  it('rejects reverting the pagination matrix Q-01 row to OFFSET', () => {
    const failures = failuresFor('paginationMatrix', (text) =>
      text.replace('| Q-01 products | **KEYSET** |', '| Q-01 products | OFFSET |'),
    );
    assert.match(failures, /pagination matrix classifies Q-01 as OFFSET/);
    assert.match(failures, /still says OFFSET and is not labelled history/);
  });

  it('rejects reverting the access-path matrix Q-01 row to OFFSET', () => {
    const failures = failuresFor('accessPathMatrix', (text) =>
      text.replace('| **KEYSET** | —/E |', '| OFFSET | —/E |'),
    );
    assert.match(failures, /access-path matrix classifies Q-01 as OFFSET/);
  });

  it('rejects reverting the query-shape catalog Q-01 row to OFFSET', () => {
    const failures = failuresFor('queryShapeCatalog', (text) =>
      text.replace(/\| Pagination \| `KEYSET`[^\n]*\|/, '| Pagination | `OFFSET` | <!-- Q-01 -->'),
    );
    assert.match(failures, /query-shape catalog Q-01 pagination is `OFFSET`/);
  });

  it('rejects order drift away from (display_order, id)', () => {
    const failures = failuresFor('adr', (text) =>
      text.replace(
        '| Q-01 product listing | `KEYSET` | `(display_order, id)` |',
        '| Q-01 product listing | `KEYSET` | `(created_at, id)` |',
      ),
    );
    assert.match(failures, /Q-01 sort is \(id\), expected \(display_order, id\)/);
  });

  it('rejects a cursor that drops the categorySlug filter identity', () => {
    const failures = failuresFor('paginationMatrix', (text) =>
      text.replace(
        '`(display_order, id)` + `categorySlug` filter identity',
        '`(display_order, id)`',
      ),
    );
    assert.match(failures, /cursor .* is missing categorySlug/);
  });

  it('rejects a claim that IDX-065 serves the unfiltered listing exactly', () => {
    const failures = failuresFor(
      'indexCatalog',
      (text) => `${text}\n\nThe unfiltered listing is an exact leading-prefix match for IDX-065.\n`,
    );
    assert.match(failures, /claims IDX-065 serves the unfiltered listing exactly/);
  });

  it('rejects an evidence fact that disagrees with the documents', () => {
    const failures = failuresFor('evidence', (text) =>
      text.replace(
        '| `IDX-065 unfiltered utility` | `NOT_LEADING_PREFIX_ORDERED` |',
        '| `IDX-065 unfiltered utility` | `EXACT_LEADING_PREFIX` |',
      ),
    );
    assert.match(failures, /`IDX-065 unfiltered utility` is "EXACT_LEADING_PREFIX"/);
  });

  it('rejects a missing machine-checked fact', () => {
    const failures = failuresFor('evidence', (text) =>
      text.replace(/\| `Q-01 cursor identity`[^\n]*\n/, ''),
    );
    assert.match(failures, /machine-checked fact `Q-01 cursor identity` is missing/);
  });
});

describe('historical prose', () => {
  it('permits a labelled superseded mention of the OFFSET classification', () => {
    const line = 'Q-01 was classified `OFFSET` from 2026-07-18 until this amendment (history).';
    assert.equal(isHistoricalLine(line), true);
    assert.deepEqual(unlabelledOffsetLines(line), []);
  });

  it('still fails an unlabelled one', () => {
    assert.deepEqual(unlabelledOffsetLines('Q-01 uses OFFSET pagination.').length, 1);
  });

  it('permits a denial of unfiltered IDX-065 support', () => {
    assert.deepEqual(
      falseUnfilteredClaims('The unfiltered form is not an exact IDX-065 leading-prefix match.'),
      [],
    );
    assert.equal(
      falseUnfilteredClaims('IDX-065 cannot order the unfiltered listing with an index scan.')
        .length,
      0,
    );
  });

  it('reads an ordering tuple in document order', () => {
    assert.deepEqual(sortTupleOf('`(display_order, id)`'), ['display_order', 'id']);
    assert.deepEqual(sortTupleOf('`id`'), ['id']);
  });
});
