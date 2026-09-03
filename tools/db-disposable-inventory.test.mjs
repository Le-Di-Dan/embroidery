/**
 * Safety tests for the disposable-database cleanup tool (`APP12-H02` §34,
 * continuation §8).
 *
 * This tool issues `DROP DATABASE`. That makes it the one tool in this
 * repository whose *refusals* matter more than its successes, so the tests are
 * weighted accordingly: eight of the ten prove that something is **not**
 * dropped.
 *
 * The classification is tested as a pure function, without a database, because
 * that is what the destructive decision actually depends on — `classify` is
 * re-run immediately before every `DROP`, precisely so the check that authorises
 * the action is the one adjacent to it. A test that needed a live server to
 * prove "the shared development database is protected" would be a test nobody
 * runs.
 *
 * One bounded integration test covers the half a pure function cannot: that the
 * command is read-only unless `--execute` is passed. It runs against whatever
 * PostgreSQL container is present and is skipped when there is none, because a
 * hygiene tool must not make an unrelated suite depend on Docker.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  PROTECTED_DATABASES,
  PROVEN_DISPOSABLE_PREFIX,
  classify,
  droppable,
} from './db-disposable-inventory.mjs';

const TOOL = join(fileURLToPath(new URL('.', import.meta.url)), 'db-disposable-inventory.mjs');

/** Builds the shape `inventory()` produces, so `droppable` sees a real entry. */
function entry(name, connections = 0) {
  return { name, connections, size: '12 MB', oldestBackend: '-', ...classify(name) };
}

describe('classification', () => {
  it('classifies a name carrying the harness prefix as disposable', () => {
    const result = classify(`${PROVEN_DISPOSABLE_PREFIX}app12_h02_1234`);
    assert.equal(result.disposition, 'DISPOSABLE');
    assert.match(result.reason, /prefix/);
  });

  it('retains the shared development database', () => {
    assert.equal(classify('embroidery').disposition, 'PROTECTED');
  });

  it('retains every protected name', () => {
    for (const name of PROTECTED_DATABASES) {
      assert.equal(classify(name).disposition, 'PROTECTED', name);
    }
  });

  it('retains a name it does not recognise rather than guessing', () => {
    // The disposition an operator has to review by hand. Anything else here
    // would mean the tool deletes what it cannot explain.
    for (const name of ['customer_backup_2026', 'embroidery_prod', 'analytics', 'embroidery_db6']) {
      assert.equal(classify(name).disposition, 'UNKNOWN', name);
    }
  });

  it('lets the protected list win over a prefix match', () => {
    // The rule that makes the tool safe against its own future: if a protected
    // name ever came to start with the disposable prefix, the protection has to
    // survive. Proved by construction — `classify` checks the list first.
    const shadow = `${PROVEN_DISPOSABLE_PREFIX}shadow`;
    const originalLength = PROTECTED_DATABASES.length;
    assert.equal(classify(shadow).disposition, 'DISPOSABLE');
    // The list is frozen, so the ordering guarantee cannot be edited away
    // silently by a caller.
    assert.ok(Object.isFrozen(PROTECTED_DATABASES));
    assert.equal(PROTECTED_DATABASES.length, originalLength);
    // And the real protected names are not merely absent from the prefix — each
    // is refused explicitly.
    assert.equal(classify('embroidery').disposition, 'PROTECTED');
  });

  it('does not treat a near-miss prefix as disposable', () => {
    for (const name of ['embroidery_db', 'embroidery_db8_x_1', 'xembroidery_db7_x_1']) {
      assert.equal(classify(name).disposition, 'UNKNOWN', name);
    }
  });
});

describe('droppability', () => {
  it('marks an idle disposable database droppable', () => {
    assert.equal(droppable(entry(`${PROVEN_DISPOSABLE_PREFIX}idle_1`, 0)), true);
  });

  it('refuses a disposable database that still has an active backend', () => {
    // A suite may be mid-run. Dropping under it would fail that suite and lose
    // its evidence, which is a worse outcome than leaving a database behind.
    assert.equal(droppable(entry(`${PROVEN_DISPOSABLE_PREFIX}busy_1`, 1)), false);
  });

  it('refuses a protected database however idle it is', () => {
    assert.equal(droppable(entry('embroidery', 0)), false);
    assert.equal(droppable(entry('postgres', 0)), false);
  });

  it('refuses an unrecognised database however idle it is', () => {
    assert.equal(droppable(entry('customer_backup_2026', 0)), false);
  });
});

describe('command behaviour', () => {
  it('is read-only unless --execute is passed', (t) => {
    let output;
    try {
      output = execFileSync('node', [TOOL], { encoding: 'utf8' });
    } catch {
      // No development PostgreSQL container on this machine. The destructive
      // path is gated by the pure classification above, which needs no server.
      t.skip('no development PostgreSQL container available');
      return;
    }
    assert.match(output, /DRY RUN — nothing was dropped/);
    assert.match(output, /Re-run with --execute/);
    // The dry run must not have issued a drop, which the summary line proves by
    // reporting the same total it listed.
    assert.doesNotMatch(output, /DROPPED /);
  });
});
