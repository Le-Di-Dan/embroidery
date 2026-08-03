/**
 * Next-phase chronology for the `APP2-X01` closure gate (`APP2-X01-C2`).
 *
 * Split out of `check-app2-closure.test.mjs` by responsibility, under explicit
 * human authorization: these cases are the only ones that need real throwaway
 * Git repositories with hand-built history, and together with the pre-existing
 * closure regressions they exceeded the repository's 600-line test hard limit.
 *
 * What they pin is one invariant — *no APP3 report may enter history before the
 * accepted APP2 closure commit* — and, just as importantly, that an APP3 report
 * written **after** closure is ordinary correct work. The rule these replace
 * banned every `reports/APP3-*.md` outright and then carved out one exact
 * filename; it blocked two mandated post-closure governance reports, because a
 * filename cannot carry chronology and an allowlist does not scale.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { REPO_ROOT } from './check-app2-closure.mjs';
import { checkNextPhaseChronology } from './check-app2-closure-artifacts.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const REPORTS = 'docs/implementation/reports';
const G01 = `${REPORTS}/APP3-G01-COMPLETION-REPORT.md`;
const AUDIT = `${REPORTS}/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`;
const ENTRY = `${REPORTS}/APP3-ENTRY-BRANCH-RECONCILIATION-REPORT.md`;
const FOUR = ['APP3-B01', 'APP3-D01', 'APP3-S02', 'APP3-X01'].map(
  (id) => `${REPORTS}/${id}-COMPLETION-REPORT.md`,
);
const CLOSURE = 'app2 closure';

/** A throwaway git repository with a controllable history. */
function tempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'app2-chrono-'));
  temporaries.push(dir);
  const git = (...args) => {
    const run = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
    return (run.stdout ?? '').trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'chronology@example.invalid');
  git('config', 'user.name', 'Chronology');
  const write = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, 'utf8');
  };
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '--no-gpg-sign', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, write, commit };
}

/** Close at a commit carrying no APP3 report, then run `arrange` after it. */
function afterClosure(arrange) {
  const repo = tempGitRepo();
  repo.write(`${REPORTS}/APP2-X01-COMPLETION-REPORT.md`, '# closure\n');
  const closureCommit = repo.commit(CLOSURE);
  arrange(repo);
  return checkNextPhaseChronology({ repoRoot: repo.dir, closureCommit });
}

/** Commit every path as a post-closure report. */
const commitAll = (paths) => (repo) => {
  for (const path of paths) repo.write(path, '# report\n');
  repo.commit('post-closure report');
};

/** [name, arrange, expected tracked, expected pending] — all must pass. */
const ACCEPTED = [
  ['no APP3 report at all', (r) => (r.write('docs/n.md', 'x'), r.commit('after')), [], []],
  ['a committed APP3-G01 report', commitAll([G01]), [G01], []],
  ['four different APP3 reports, with no allowlist', commitAll(FOUR), FOUR, []],
  ['the pre-implementation audit report', commitAll([AUDIT]), [AUDIT], []],
  ['the entry-branch reconciliation report', commitAll([ENTRY]), [ENTRY], []],
  ['an untracked APP3 report', (r) => r.write(G01, '# pending\n'), [], [G01]],
  ['a staged APP3 report', (r) => (r.write(G01, '# staged\n'), r.git('add', '-A')), [], [G01]],
];

describe('APP2 closure — next-phase chronology accepts post-closure work', () => {
  for (const [name, arrange, tracked, pending] of ACCEPTED) {
    it(`passes for ${name}`, () => {
      const evidence = afterClosure(arrange);
      assert.deepEqual(evidence.violations, []);
      assert.deepEqual(evidence.trackedPostClosureReports, [...tracked].sort());
      assert.deepEqual(evidence.pendingPostClosureReports, [...pending].sort());
    });
  }
});

/** [name, arrange -> {closureCommit, expected}] — all must fail. */
const REJECTED = [
  [
    'an APP3 report first added before closure',
    (r) => {
      r.write(G01, '# too early\n');
      const first = r.commit('app3 before closure');
      rmSync(join(r.dir, G01));
      const closureCommit = r.commit(CLOSURE);
      r.write(G01, '# re-added\n');
      r.commit('re-added after closure');
      return { closureCommit, expected: `first added by ${first}` };
    },
  ],
  [
    'an APP3 report present in the closure commit tree',
    (r) => {
      r.write(G01, '# inside closure\n');
      const closureCommit = r.commit(CLOSURE);
      r.write('docs/notes.md', 'later\n');
      r.commit('after closure');
      return { closureCommit, expected: 'present in the APP2 closure commit' };
    },
  ],
  [
    'a closure commit that is not an ancestor of HEAD',
    (r) => {
      r.write('docs/notes.md', 'base\n');
      const base = r.commit('base');
      r.write('docs/notes.md', 'closure lineage\n');
      const closureCommit = r.commit(CLOSURE);
      r.git('checkout', '-q', '-b', 'divergent', base);
      r.write('docs/other.md', 'divergent lineage\n');
      r.commit('divergent');
      return { closureCommit, expected: 'HEAD does not descend from' };
    },
  ],
];

describe('APP2 closure — next-phase chronology rejects work that predates closure', () => {
  for (const [name, arrange] of REJECTED) {
    it(`rejects ${name}`, () => {
      const repo = tempGitRepo();
      const { closureCommit, expected } = arrange(repo);
      const { violations } = checkNextPhaseChronology({ repoRoot: repo.dir, closureCommit });
      assert.ok(
        violations.some((line) => line.includes(expected)),
        `expected "${expected}", got ${JSON.stringify(violations)}`,
      );
    });
  }

  it('fails loudly when git cannot resolve chronology at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'app2-chrono-nogit-'));
    temporaries.push(dir);
    const { violations } = checkNextPhaseChronology({
      repoRoot: dir,
      closureCommit: 'a'.repeat(40),
    });
    assert.ok(violations.some((line) => line.includes('chronology unresolved')));
  });

  it('prints "APP3 chronology valid" and never "APP3 NOT STARTED"', () => {
    const run = spawnSync(process.execPath, ['tools/check-app2-closure.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /APP3 chronology valid/);
    assert.doesNotMatch(run.stdout, /APP3 NOT STARTED/);
  });
});
