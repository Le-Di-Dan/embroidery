/**
 * Regressions for the `APP3-S10` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working editor** behind:
 *
 * - the debounce quietly shortened, which saves more often and is correct on
 *   every screen until the Session hits its 30-per-minute ceiling;
 * - the dirty-age ceiling removed, so a customer dragging for a minute has a
 *   minute of unsaved work and nothing on screen says so;
 * - a second request allowed in flight, which races two revisions of the same
 *   document and wins whichever finishes last;
 * - the response revision ignored in favour of `previous + 1`, which agrees with
 *   the server every time until two tabs exist;
 * - a `409` retried straight from the failure, or a lost response replayed, each
 *   of which is how a stale document overwrites a good one;
 * - an older response adopted over a newer local edit, which silently undoes
 *   whatever the customer typed while the save was in flight;
 * - a conflict auto-resolved, or given a third button, which decides for the
 *   customer which of two designs survives;
 * - the document written to `localStorage`, which makes the approved offline
 *   copy a lie and is a save nobody reviewed;
 * - the resume handle stripped of its placement namespace, which offers one
 *   Area's design as another's.
 *
 * Every one of those passes a happy-path render test.
 *
 * The sub-checks run against a temp root; the whole gate is proved once against
 * the real repository in the last block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  checkApp3S10,
  checkCadence,
  checkCommandIndex,
  checkConflict,
  checkDesignApproval,
  checkImmutability,
  checkNonScope,
  checkOneInFlight,
  checkPredecessors,
  checkReconciliation,
  checkResumeFlow,
  checkResumeHandle,
  checkSurfaces,
} from './check-app3-s10.mjs';
import { CANONICAL_FILES, FEATURE, REPO_ROOT, read } from './check-app3-s10.sources.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

/**
 * The exact line `APP3-S10` is recorded under, named once.
 *
 * Every phase mutation rewrites the status around it, so a `.replace` whose
 * target has moved passes while proving nothing — the failure `APP3-S08-C1`
 * recorded three times over, and the reason this is a constant.
 */
/**
 * The line the phase currently records `APP3-S10` under.
 *
 * It moved to the accepted form when human review accepted the checkpoint, and
 * these mutations replace it — so a constant left on the delivered wording would
 * `.replace` nothing, and every case built on it would assert against an
 * unmodified file while still passing. That silent no-op is the failure
 * `APP3-S10` itself recorded three times; this is the same trap one checkpoint
 * later.
 */
const S10_STATUS_LINE = '\nAPP3-S10 = COMPLETE — REVIEW_ACCEPTED\n';

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s10-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s10.mjs',
    'tools/check-app3-s10-runtime.mjs',
    'tools/check-app3-s10.sources.mjs',
    'tools/app3-accepted-paths.mjs',
  ]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // Not every canonical path exists while Commit A is being prepared.
    }
  }
  // The whole feature and the whole test tree, because the feature-wide rules
  // and the size rules must see every file — a rule that only read the files it
  // knew about would be satisfied by a new one breaking it.
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });
  cpSync(join(REPO_ROOT, 'apps/storefront/test'), join(base, 'apps/storefront/test'), {
    recursive: true,
  });

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s10-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

function run(check, overrides = {}) {
  const failures = [];
  check(rootWith(overrides), (message) => failures.push(message));
  return failures;
}

/** One source file with one substring rewritten, proved to have been present. */
function replacing(key, from, to) {
  const source = file(key);
  assert.ok(source.includes(from), `no source contains "${from}"`);
  return source.replaceAll(from, to);
}

/** One source file with a line appended. */
function appending(key, line) {
  return `${file(key)}\n${line}\n`;
}

/* -------------------------------------------------------------------------- */

describe('predecessors and status', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(run(checkPredecessors), []);
  });

  it('refuses an unaccepted predecessor', () => {
    for (const id of ['APP3-B08', 'APP3-P04', 'APP3-S08']) {
      const phase = file('phase').replace(
        `\n${id} = COMPLETE — REVIEW_ACCEPTED`,
        `\n${id} = READY`,
      );
      assert.ok(mentions(run(checkPredecessors, { phase }), id), id);
    }
  });

  it('refuses a later Studio capability recorded complete', () => {
    const phase = file('phase').replace(
      S10_STATUS_LINE,
      `${S10_STATUS_LINE}APP3-E01 = COMPLETE — REVIEW_DELIVERED\n`,
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-E01'));
  });

  it('refuses a status the checkpoint may not be recorded under', () => {
    const phase = file('phase').replace(S10_STATUS_LINE, '\nAPP3-S10 = SELF_ACCEPTED\n');
    assert.ok(mentions(run(checkPredecessors, { phase }), 'legitimate status'));
  });

  it('refuses a new S08 correction invented against the operator ruling', () => {
    for (const invented of ['APP3-S08-C2', 'APP3-S08-MI01', 'APP3-S10-C1']) {
      const phase = file('phase').replace(
        S10_STATUS_LINE,
        `${S10_STATUS_LINE}${invented} = READY — NOT STARTED\n`,
      );
      assert.ok(mentions(run(checkPredecessors, { phase }), invented), invented);
    }
  });

  it('refuses the carry-forward ownership being dropped', () => {
    const phase = file('phase').replace(
      'S08_CARRY_FORWARD_RECONCILIATION_OWNER = APP3-S10',
      'S08_CARRY_FORWARD_RECONCILIATION_OWNER = APP3-S08-C2',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'carry-forward owner'));
  });

  it('refuses the cadence or the UI moved back to APP3-S11', () => {
    for (const owner of ['AUTOSAVE_UI_OWNER = APP3-S10', 'AUTOSAVE_CADENCE_OWNER = APP3-S10']) {
      // `replaceAll`: the roadmap reconciliation quotes both lines in prose
      // above the status block, and a `replace` would rewrite the quotation and
      // leave the line the gate actually reads untouched.
      const phase = file('phase').replaceAll(owner, owner.replace('APP3-S10', 'APP3-E01'));
      assert.ok(mentions(run(checkPredecessors, { phase }), owner), owner);
    }
  });

  it('refuses a dropped provenance line', () => {
    for (const line of [
      'APP3-S10 CADENCE = 2500_MS_QUIET_UNDER_A_10000_MS_CEILING',
      'APP3-S10 CONFLICT = TWO_CHOICES_NO_MERGE',
      'APP3-S10 AMBIGUOUS = RECONCILE_BEFORE_REPLAY',
      'APP3-S10 RESUME_HANDLE = NON_SECRET_SESSION_ID_ONLY',
      'APP3-S10 HISTORY = RESET_ONLY_ON_BRANCH_REPLACEMENT',
    ]) {
      const phase = file('phase').replace(`\n${line}`, '\nAPP3-S10 NOTE = something else');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });
});

describe('design approval stays scoped', () => {
  it('accepts the six approved rows', () => {
    assert.deepEqual(run(checkDesignApproval), []);
  });

  it('refuses an unapproved S10 row', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-AUTOSAVE-DESKTOP-CONFLICT \|[^\n]*?)APPROVED_FOR_IMPLEMENTATION/,
      '$1REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'not approved'));
  });

  it('refuses a row that resolves to a different node', () => {
    const registry = file('registry').replace('| 610:118 |', '| 610:999 |');
    assert.ok(mentions(run(checkDesignApproval, { registry }), '610:118'));
  });

  it('refuses a blanket Studio approval', () => {
    // The mutation that unblocks every later checkpoint at once. Asserted on a
    // mobile row: every desktop row now belongs to an opened checkpoint, so one
    // of those would be caught for a reason that had stopped being true.
    const registry = file('registry').replaceAll('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'FIG-APP3-HANDOFF-DEPENDENCY'));
  });

  it('refuses the 1024 reference re-attributed to this checkpoint', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*?)APP3-D01-C1/,
      '$1APP3-S10',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), '1024 reference'));
  });
});

describe('the cadence', () => {
  it('accepts the delivered loop', () => {
    assert.deepEqual(run(checkCadence), []);
  });

  it('refuses a silently shortened debounce', () => {
    const model = replacing('model', 'AUTOSAVE_DEBOUNCE_MS = 2500', 'AUTOSAVE_DEBOUNCE_MS = 400');
    assert.ok(mentions(run(checkCadence, { model }), 'debounce'));
  });

  it('refuses a ceiling that no longer bounds a continuous edit', () => {
    const model = replacing('model', 'Math.min(quiet, ceiling)', 'quiet');
    assert.ok(mentions(run(checkCadence, { model }), 'earlier of quiet and ceiling'));
  });

  it('refuses the ceiling measured from the last edit rather than the first', () => {
    const model = replacing(
      'model',
      'streak.since + AUTOSAVE_MAX_DIRTY_AGE_MS',
      'streak.last + AUTOSAVE_MAX_DIRTY_AGE_MS',
    );
    assert.ok(mentions(run(checkCadence, { model }), 'measured from the last edit'));
  });

  it('refuses an interval, a background sync or a save from unload', () => {
    for (const [needle, message] of [
      ['setInterval(save, 2500);', 'polls'],
      ['void navigator.serviceWorker;', 'polls'],
      ['void navigator.sendBeacon;', 'unload'],
    ]) {
      const controller = appending('controller', needle);
      assert.ok(mentions(run(checkCadence, { controller }), message), needle);
    }
  });

  it('refuses an unload handler that fires a save', () => {
    const warning = replacing(
      'warning',
      "window.addEventListener('beforeunload', warn);",
      "window.addEventListener('beforeunload', warn);\n    void attemptSave(id, doc, 1);",
    );
    assert.ok(mentions(run(checkCadence, { warning }), 'fires a save'));
  });

  it('refuses a permanently installed navigation warning', () => {
    const warning = replacing('warning', 'removeEventListener', 'addEventListener');
    assert.ok(mentions(run(checkCadence, { warning }), 'never removed'));
  });
});

describe('one request, and the server’s own revision', () => {
  it('accepts the delivered loop', () => {
    assert.deepEqual(run(checkOneInFlight), []);
  });

  it('refuses a second save starting while one is in flight', () => {
    const controller = replacing(
      'controller',
      'if (document === null || inFlight.current !== null',
      'if (document === null || false',
    );
    assert.ok(mentions(run(checkOneInFlight, { controller }), 'second save'));
  });

  it('refuses a revision the client computed', () => {
    const controller = replacing(
      'controller',
      'expectedRevision: serverRevision.current',
      'expectedRevision: revision + 1',
    );
    const failures = run(checkOneInFlight, { controller });
    assert.ok(mentions(failures, 'computed rather than read'));
    assert.ok(mentions(failures, 'the revision it last read'));
  });

  it('refuses a response revision that is not adopted', () => {
    const controller = replacing(
      'controller',
      'serverRevision.current = result.snapshot.revision;',
      'serverRevision.current = serverRevision.current;',
    );
    assert.ok(mentions(run(checkOneInFlight, { controller }), 'verbatim'));
  });

  it('refuses an older response overwriting a newer local edit', () => {
    const controller = replacing('controller', 'if (streak.current === null) {', 'if (true) {');
    assert.ok(mentions(run(checkOneInFlight, { controller }), 'newer local edit'));
  });
});

describe('nothing is replayed before the server answers', () => {
  it('accepts the delivered reconciliation', () => {
    assert.deepEqual(run(checkReconciliation), []);
  });

  it('refuses a stale or unknown outcome retried without a read', () => {
    const controller = replacing(
      'controller',
      "if (why === 'conflict' || why === 'ambiguous') {",
      "if (why === 'conflict') {",
    );
    assert.ok(mentions(run(checkReconciliation, { controller }), 'without a read'));
  });

  it('refuses a response-less failure classified as retryable', () => {
    const model = replacing(
      'model',
      "if (status === undefined) return 'ambiguous';",
      "if (status === undefined) return 'server';",
    );
    assert.ok(mentions(run(checkReconciliation, { model }), 'ambiguous'));
  });

  it('refuses an unmoved revision read as anything but "nothing was written"', () => {
    const model = replacing(
      'model',
      "if (input.latestRevision === input.baseRevision) return 'absent';",
      "if (input.latestRevision === input.baseRevision) return 'persisted';",
    );
    assert.ok(mentions(run(checkReconciliation, { model }), 'nothing was written'));
  });

  it('refuses an unbounded retry ladder', () => {
    const model = replacing(
      'model',
      'Object.freeze([5000, 15_000])',
      'Object.freeze([1000, 1000, 1000, 1000, 1000])',
    );
    assert.ok(mentions(run(checkReconciliation, { model }), 'bounded'));
  });

  it('refuses a ladder that never stops', () => {
    const controller = replacing(
      'controller',
      "        enter('ERROR_PAUSED');\n        return;",
      '        return;',
    );
    assert.ok(mentions(run(checkReconciliation, { controller }), 'does not stop'));
  });
});

describe('the conflict is the customer’s to resolve', () => {
  it('accepts the delivered decision', () => {
    assert.deepEqual(run(checkConflict), []);
  });

  it('refuses a third conflict choice', () => {
    const state = replacing(
      'state',
      'data-testid="studio-save-keep-local"',
      'data-testid="studio-save-keep-local-and-merge"\n            data-testid="studio-save-load-latest-copy"',
    );
    assert.ok(mentions(run(checkConflict, { state }), 'choices, not 2'));
  });

  it('refuses an automatic merge', () => {
    const controller = appending('controller', 'const merged = mergeDocuments(a, b);');
    assert.ok(mentions(run(checkConflict, { controller }), 'merging'));
  });

  it('refuses loading the latest while keeping the stale local past', () => {
    const controller = replacing(
      'controller',
      '.adoptServerBranch(sessionKeyOf(sessionId, latest.revision), latest.document);',
      '.reconcile(latest.document);',
    );
    assert.ok(mentions(run(checkConflict, { controller }), 'stale local past'));
  });

  it('refuses keeping the local branch without ever saving it', () => {
    const controller = replacing(
      'controller',
      '    streak.current = streak.current ?? { since: now, last: now };\n    runSave();',
      '    streak.current = streak.current ?? { since: now, last: now };',
    );
    assert.ok(mentions(run(checkConflict, { controller }), 'never saves it'));
  });

  it('refuses a rewritten conflict action label', () => {
    const copy = replacing(
      'copy',
      "conflictLoadLatest: 'Tải bản mới nhất'",
      "conflictLoadLatest: 'Ghi đè'",
    );
    assert.ok(mentions(run(checkConflict, { copy }), 'Tải bản mới nhất'));
  });
});

describe('the resume handle keeps one id and nothing else', () => {
  it('accepts the delivered handle', () => {
    assert.deepEqual(run(checkResumeHandle), []);
  });

  it('refuses a handle stripped of its placement namespace', () => {
    const handle = replacing(
      'handle',
      '`${STORAGE_PREFIX}:${scope.productSlug}:${scope.sideCode}:${scope.areaCode}`',
      '`${STORAGE_PREFIX}`',
    );
    assert.ok(mentions(run(checkResumeHandle, { handle }), 'scope.productSlug'));
  });

  it('refuses a stored value used without validation', () => {
    const handle = replacing(
      'handle',
      'return value !== null && SESSION_ID_PATTERN.test(value) ? value : null;',
      'return value;',
    );
    assert.ok(mentions(run(checkResumeHandle, { handle }), 'without being validated'));
  });

  it('refuses the document or a secret reaching storage', () => {
    for (const smuggled of ['document', 'secret', 'revision']) {
      const handle = appending('handle', `const smuggled = ${smuggled};`);
      assert.ok(mentions(run(checkResumeHandle, { handle }), smuggled), smuggled);
    }
  });

  it('refuses browser storage reached from a second file', () => {
    // Written into a file `APP3-S10` does **not** own, which is where a document
    // cache would actually arrive.
    const documentStore = appending('documentStore', "window.localStorage.setItem('doc', '1');");
    const failures = run(checkResumeHandle, { documentStore });
    assert.ok(mentions(failures, 'outside the APP3-S10 resume handle'));
    assert.ok(mentions(failures, 'files touch browser storage'));
  });

  it('refuses a cookie or a session store even inside the handle', () => {
    const handle = appending('handle', 'void window.sessionStorage;');
    assert.ok(mentions(run(checkResumeHandle, { handle }), 'may keep only an id'));
  });
});

describe('resume and expiry', () => {
  it('accepts the delivered flow', () => {
    assert.deepEqual(run(checkResumeFlow), []);
  });

  it('refuses a handle that enters the editor without asking', () => {
    const screen = replacing('screen', 'resume.offered && resume.handle !== null', 'false');
    assert.ok(mentions(run(checkResumeFlow, { screen }), 'approved resume state'));
  });

  it('refuses declining a resume that opens a Session by itself', () => {
    const screen = replacing(
      'screen',
      'onRestart={resume.forget}',
      'onRestart={() => { resume.forget(); session.startBlank(codes); }}',
    );
    assert.ok(mentions(run(checkResumeFlow, { screen }), 'opens a Session by itself'));
  });

  it('refuses an expired Session keeping its handle', () => {
    const screen = replacing(
      'screen',
      'if (sessionExpired) forgetSession();',
      'if (sessionExpired) return;',
    );
    assert.ok(mentions(run(checkResumeFlow, { screen }), 'keeps its resume handle'));
  });

  it('refuses a client that invents Session lifetime or scans cookies', () => {
    for (const invented of ['extendSession', 'document.cookie']) {
      const controller = appending('controller', `void ${invented};`);
      assert.ok(mentions(run(checkResumeFlow, { controller }), invented), invented);
    }
  });
});

describe('the surfaces', () => {
  it('accepts the delivered surfaces', () => {
    assert.deepEqual(run(checkSurfaces), []);
  });

  it('refuses a second Studio topbar', () => {
    const state = appending('state', 'const bar = <div className="studio-stage__topbar" />;');
    assert.ok(mentions(run(checkSurfaces, { state }), 'more than one Studio topbar'));
  });

  it('refuses a save state reported by colour alone', () => {
    const chip = replacing('chip', '{TONE_LABEL[tone]}', '{null}');
    assert.ok(mentions(run(checkSurfaces, { chip }), 'colour alone'));
  });

  it('refuses a saved-at time invented from a clock', () => {
    const chip = replacing(
      'chip',
      "const at = tone === 'saved' && lastSavedAt !== null ? clockOf(lastSavedAt) : null;",
      'const at = clockOf(Date.now());',
    );
    assert.ok(mentions(run(checkSurfaces, { chip }), 'without a successful save'));
  });

  it('refuses a backend internal shown to a customer', () => {
    const copy = replacing('copy', "conflictHeading: '", "conflictHeading: '409 · ");
    assert.ok(mentions(run(checkSurfaces, { copy }), 'backend internal'));
  });

  it('refuses a decision surface nobody can reach', () => {
    const state = replacing('state', 'region.current?.focus();', 'void region;');
    assert.ok(mentions(run(checkSurfaces, { state }), 'not reachable'));
  });

  it('refuses a dismissal that marks the design saved', () => {
    const controller = replacing(
      'controller',
      '  const dismiss = useCallback(() => {',
      "  const dismiss = useCallback(() => {\n    enter('CLEAN');",
    );
    assert.ok(mentions(run(checkSurfaces, { controller }), 'marks the design saved'));
  });
});

describe('nothing pulled forward', () => {
  it('accepts the delivered feature', () => {
    assert.deepEqual(run(checkNonScope), []);
  });

  it('refuses an APP3-S11 mobile surface', () => {
    for (const mobile of ['bottomSheet', 'onTouchStart']) {
      const state = appending('state', `const pulled = ${mobile};`);
      assert.ok(mentions(run(checkNonScope, { state }), mobile), mobile);
    }
  });

  it('refuses a server response recorded as a history entry', () => {
    const documentStore = replacing(
      'documentStore',
      'return serverWrite(state, { document });',
      'return { document, history: recordAction(state.history, entry) };',
    );
    assert.ok(mentions(run(checkNonScope, { documentStore }), 'server-origin write'));
  });

  it('refuses a branch replacement that keeps the past describing it', () => {
    const documentStore = replacing(
      'documentStore',
      '        history: EMPTY_HISTORY,\n        openAction: null,\n      }),\n    );\n  },\n}));',
      '        openAction: null,\n      }),\n    );\n  },\n}));',
    );
    assert.ok(mentions(run(checkNonScope, { documentStore }), 'keeps the past'));
  });

  it('refuses a durable document cache', () => {
    for (const cache of ['caches.open', 'localforage']) {
      const controller = appending('controller', `void ${cache};`);
      assert.ok(mentions(run(checkNonScope, { controller }), cache), cache);
    }
  });

  it('refuses a hand-written API path or raw transport', () => {
    const service = appending('service', "const url = '/api/public/design-sessions';");
    assert.ok(mentions(run(checkNonScope, { service }), 'written by hand'));
  });

  it('refuses a second file calling the autosave operation', () => {
    const controller = appending('controller', 'void publicDesignSessionAutosave(a, b);');
    assert.ok(mentions(run(checkNonScope, { controller }), 'files call autosave'));
  });
});

describe('the artifacts a frontend checkpoint must not move', () => {
  it('accepts the delivered artifacts', () => {
    assert.deepEqual(run(checkImmutability), []);
  });

  it('refuses a changed API surface', () => {
    const openapi = JSON.parse(file('openapi'));
    openapi.paths['/api/public/invented'] = { get: {} };
    assert.ok(
      mentions(run(checkImmutability, { openapi: JSON.stringify(openapi) }), 'paths, expected 37'),
    );
  });

  it('refuses a persistence dependency', () => {
    const storefront = JSON.parse(file('storefrontPackage'));
    storefront.dependencies = { ...storefront.dependencies, localforage: '^1.0.0' };
    const failures = run(checkImmutability, { storefrontPackage: JSON.stringify(storefront) });
    assert.ok(mentions(failures, 'persistence dependency'));
  });

  it('refuses the autosave operation withdrawn from its consumer', () => {
    const curatedClient = file('curatedClient').replaceAll('publicDesignSessionAutosave', 'x');
    assert.ok(mentions(run(checkImmutability, { curatedClient }), 'not exported to its consumer'));
  });

  it('refuses an operation with no consumer crossing the boundary', () => {
    const curatedClient = `${file('curatedClient')}\nexport {\n  publicProductMediaGet,\n} from './generated/embroidery-api';\n`;
    assert.ok(mentions(run(checkImmutability, { curatedClient }), 'no consumer'));
  });

  it('refuses an unregistered command', () => {
    const index = file('index').replaceAll('CMD-CHECK-APP3-S10', 'CMD-CHECK-APP3-SAVE');
    assert.ok(mentions(run(checkCommandIndex, { index }), 'CMD-CHECK-APP3-S10'));
  });

  it('refuses a checkpoint command added as a root script', () => {
    const manifest = JSON.parse(file('rootPackage'));
    manifest.scripts = { ...manifest.scripts, 'check:app3-s10': 'node tools/check-app3-s10.mjs' };
    const failures = run(checkCommandIndex, { rootPackage: JSON.stringify(manifest) });
    assert.ok(mentions(failures, 'root script'));
  });
});

describe('the whole gate', () => {
  it('passes against the real repository', () => {
    const failures = [];
    checkApp3S10(REPO_ROOT, (message) => failures.push(message));
    assert.deepEqual(failures, []);
  });
});
