/**
 * Regressions for the `APP3-S08` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working undo button** behind:
 *
 * - `beginAction` moved onto the pointer frame, which records sixty entries for
 *   one drag and puts an allocation on the measured surface;
 * - the bound removed, which is a browser tab holding every document a customer
 *   ever produced;
 * - the eviction removed while the constant stays, which is a limit nothing
 *   enforces;
 * - the redo kept across a new forward edit, which offers to reinstate a
 *   document the latest edit was never applied to;
 * - `undo` routed through `commit`, which records the undo and makes the state
 *   before it unreachable;
 * - the history written to `localStorage`, which is a save nobody reviewed;
 * - the editable-field guard removed, which makes one keystroke do two undos;
 * - the selection, the zoom or the watermark token restored, which moves things
 *   the customer never changed;
 * - a `<button>` in the history list, which is time travel nobody approved.
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
  checkApp3S08,
  checkBaselineCopy,
  checkBounded,
  checkControlPlacement,
  checkCoalescing,
  checkCommandIndex,
  checkDesignApproval,
  checkDomainHistory,
  checkEntryContents,
  checkExcludedState,
  checkImmutability,
  checkIntegration,
  checkNoPersistence,
  checkNoSideEffects,
  checkOneCurrentDocument,
  checkOwnership,
  checkPanel,
  checkPredecessors,
  checkProjection,
  checkSafeLabels,
  checkShortcuts,
} from './check-app3-s08.mjs';
import {
  CANONICAL_FILES,
  FEATURE,
  REPO_ROOT,
  S08_DESIGN_ROWS,
  read,
} from './check-app3-s08.sources.mjs';

/**
 * The exact status line the phase currently records `APP3-S08` under.
 *
 * Named once rather than spelled out at each mutation site: it has changed twice
 * already (delivery, then `APP3-S08-C1`), and each time a spelled-out target
 * turned a mutation's `.replace` into a silent no-op — the mutation then passed
 * by mutating nothing, which is the failure this suite exists to catch.
 */
/**
 * The exact line `APP3-S08` is recorded under, named once.
 *
 * Every mutation below rewrites the phase status around it, so a `.replace`
 * whose target has moved passes while proving nothing — the failure this
 * checkpoint's predecessor recorded and this constant exists to make impossible
 * to repeat quietly. It moved again at `APP3-S10`, when human review accepted
 * the correction.
 */
const S08_STATUS_LINE = '\nAPP3-S08 = COMPLETE — REVIEW_ACCEPTED — CORRECTED_BY_APP3-S08-C1\n';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s08-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'package.json',
    'tools/check-app3-s08.mjs',
    'tools/check-app3-s08-runtime.mjs',
    'tools/check-app3-s08.sources.mjs',
    'apps/storefront/test/unit/studio-history-model.test.ts',
    'apps/storefront/test/components/studio-history.test.tsx',
    'apps/storefront/test/components/studio-history-integration.test.tsx',
  ]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // Not every canonical path exists while Commit A is being prepared.
    }
  }
  // The whole feature, because the feature-wide rules must see every file — a
  // rule that only read the files it knew about would be satisfied by a new one
  // breaking it.
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s08-case-'));
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

/** One source file with **every** matching line deleted. */
function without(key, needle) {
  const source = file(key);
  const lines = source.split('\n').filter((line) => line.includes(needle));
  assert.ok(lines.length > 0, `no line contains "${needle}"`);
  let mutated = source;
  for (const line of lines) mutated = mutated.replaceAll(`${line}\n`, '');
  return mutated;
}

/** One source file with one substring rewritten. */
function replacing(key, from, to) {
  const source = file(key);
  assert.ok(source.includes(from), `no source contains "${from}"`);
  return source.replaceAll(from, to);
}

/* -------------------------------------------------------------------------- */

describe('predecessors and status', () => {
  it('accepts the delivered phase document', () => {
    assert.deepEqual(run(checkPredecessors), []);
  });

  it('rejects an unaccepted predecessor', () => {
    for (const line of [
      'APP3-S03 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-S09 = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects a later capability recorded complete here', () => {
    for (const later of ['APP3-S11']) {
      const phase = file('phase').replace(
        S08_STATUS_LINE,
        `${S08_STATUS_LINE}${later} = COMPLETE — REVIEW_DELIVERED\n`,
      );
      assert.ok(mentions(run(checkPredecessors, { phase }), later), later);
    }
  });

  it('rejects a group follow-up closed by a checkpoint that did not resolve it', () => {
    const phase = file('phase').replace(
      'FU-APP3-S04-GROUP-AUTHORITY-01 = OPEN',
      'FU-APP3-S04-GROUP-AUTHORITY-01 = CLOSED',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'group-authority follow-up'));
  });

  it('rejects a status the checkpoint may not be recorded under', () => {
    const phase = file('phase').replace(S08_STATUS_LINE, '\nAPP3-S08 = SELF_ACCEPTED\n');
    assert.ok(mentions(run(checkPredecessors, { phase }), 'legitimate status'));
  });

  it('rejects a dropped provenance line', () => {
    for (const line of [
      'APP3-S08 BOUND = 50',
      'APP3-S08 CURRENT_DOCUMENT = ONE',
      'APP3-S08 SIDE_EFFECTS = NONE',
      'APP3-S08 HISTORY_LIST = INFORMATIONAL',
    ]) {
      const phase = file('phase').replace(`\n${line}`, '\nAPP3-S08 NOTE = something else');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });
});

describe('design approval', () => {
  it('accepts the two approved rows', () => {
    assert.deepEqual(run(checkDesignApproval), []);
  });

  it('rejects an unapproved S08 row', () => {
    const registry = file('registry').replace(
      'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY | Storefront | Studio undo & redo | Undo / Redo | Mid History | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION',
      'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY | Storefront | Studio undo & redo | Undo / Redo | Mid History | Desktop 1440 | high-fidelity | REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'not approved'));
  });

  it('rejects a row approved without this checkpoint as its evidence', () => {
    /*
     * The whole evidence cell, not one sentence of it.
     *
     * `APP3-S08-C1` appended the live node read to the same cell, so a mutation
     * that removed only the original sentence left `APP3-S08` behind inside
     * `APP3-S08-C1` and the rule went on passing — the mutation mutated
     * nothing. Rewriting the two rows' evidence outright is what the rule is
     * actually about.
     */
    const registry = file('registry')
      .split('\n')
      .map((line) =>
        Object.keys(S08_DESIGN_ROWS).some((id) => line.startsWith(`| ${id} |`))
          ? line.replaceAll('APP3-S08', 'APP3-D01')
          : line,
      )
      .join('\n');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'no APP3-S08 approval evidence'));
  });

  it('rejects a later checkpoint row released early', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-MOBILE-LAYERSSHEET \|[^\n]*)REVIEW_REQUIRED/,
      '$1APPROVED_FOR_IMPLEMENTATION',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'later checkpoint'));
  });

  it('rejects the 1024 reference re-attributed to this checkpoint', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*)\|( \d{4}-\d{2}-\d{2} \|)/,
      '$1APP3-S08 |$2',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 're-attributed'));
  });
});

describe('domain snapshots, never an engine stack', () => {
  it('accepts the delivered model', () => {
    assert.deepEqual(run(checkDomainHistory), []);
  });

  it('rejects an engine history stack anywhere in the feature', () => {
    const model = `${file('model')}\nexport const dump = () => stage.toJSON();\n`;
    assert.ok(mentions(run(checkDomainHistory, { model }), 'toJSON()'));
  });

  it('rejects an entry that no longer carries both ends', () => {
    for (const end of ['before', 'after']) {
      const model = replacing(
        'model',
        `readonly ${end}: DesignDocument`,
        `readonly ${end}: unknown`,
      );
      assert.ok(mentions(run(checkDomainHistory, { model }), `"${end}" document`), end);
    }
  });
});

describe('what an entry may hold', () => {
  it('accepts the delivered history files', () => {
    assert.deepEqual(run(checkEntryContents), []);
  });

  it('rejects a mutable runtime value reaching the history files', () => {
    for (const forbidden of ['Blob', 'ElementGraph', 'DOMMatrix', 'createObjectURL']) {
      const model = `${file('model')}\nexport type Leak = ${forbidden};\n`;
      assert.ok(mentions(run(checkEntryContents, { model }), forbidden), forbidden);
    }
  });
});

describe('one current document', () => {
  it('accepts the delivered store', () => {
    assert.deepEqual(run(checkOneCurrentDocument), []);
  });

  it('rejects a second current document', () => {
    const model = `${file('model')}\nexport const historyCurrentDocument = null;\n`;
    assert.ok(mentions(run(checkOneCurrentDocument, { model }), 'second current document'));
  });

  it('rejects an undo that records itself', () => {
    const store = replacing(
      'store',
      `    set({
      document: entry.before,`,
      `    get().commit(entry.before, entry.action);
    set({
      document: entry.before,`,
    );
    assert.ok(mentions(run(checkOneCurrentDocument, { store }), 'records itself'));
  });

  it('rejects a fourth store', () => {
    const failures = run(checkOneCurrentDocument, {
      [`${FEATURE}/store/studio-history.store.ts`]: 'export const useHistoryStore = () => null;\n',
    });
    assert.ok(mentions(failures, 'exactly three stores'));
  });
});

describe('the bound', () => {
  it('accepts the delivered bound', () => {
    assert.deepEqual(run(checkBounded), []);
  });

  it('rejects a history with no declared bound', () => {
    const model = replacing('model', 'MAX_HISTORY_ENTRIES = 50', 'MAX_HISTORY_ENTRIES = Infinity');
    assert.ok(mentions(run(checkBounded, { model }), 'no MAX_HISTORY_ENTRIES bound'));
  });

  it('rejects a bound nothing enforces', () => {
    const model = replacing('model', 'kept.slice(overflow)', 'kept');
    assert.ok(mentions(run(checkBounded, { model }), 'discards the oldest'));
  });

  it('rejects a panel that does not state the bound', () => {
    const list = without('list', 'MAX_HISTORY_ENTRIES');
    assert.ok(mentions(run(checkBounded, { list }), 'does not state the bound'));
  });

  it('rejects copy implying an unlimited history', () => {
    const copy = replacing('copy', 'Lịch sử giới hạn ${String(limit)} bước', 'Giữ toàn bộ lịch sử');
    assert.ok(mentions(run(checkBounded, { copy }), 'unlimited history'));
  });

  it('accepts the honest prose that names what it forbids', () => {
    // The docblock explains *why* an infinite history may not be implied, and
    // therefore contains the words. A rule on the raw file would fail here.
    assert.ok(file('copy').includes('infinite history'));
    assert.deepEqual(run(checkBounded), []);
  });
});

describe('coalescing', () => {
  it('accepts the delivered boundaries', () => {
    assert.deepEqual(run(checkCoalescing), []);
  });

  it('rejects a gesture that opens no coalesced action', () => {
    const transform = without('transform', 'beginAction({ kind, label })');
    assert.ok(mentions(run(checkCoalescing, { transform }), 'one coalesced action'));
  });

  it('rejects a gesture that never closes', () => {
    const transform = replacing(
      'transform',
      `      endAction();
      setIsTransforming(false);`,
      '      setIsTransforming(false);',
    );
    assert.ok(mentions(run(checkCoalescing, { transform }), 'close its action on release'));
  });

  it('rejects a snapshot taken on every pointer frame', () => {
    const transform = replacing(
      'transform',
      '      liveCommit(outcome.document, { kind: active.kind, label: active.label });',
      '      const snapshot = JSON.parse(JSON.stringify(outcome.document));\n' +
        '      liveCommit(snapshot, { kind: active.kind, label: active.label });',
    );
    assert.ok(mentions(run(checkCoalescing, { transform }), 'every pointer frame'));
  });

  it('rejects a text edit that is not bracketed as one session', () => {
    const text = without('text', 'beginEdit');
    assert.ok(mentions(run(checkCoalescing, { text }), 'one session'));
  });

  it('rejects a debounce timer standing in for a semantic boundary', () => {
    const text = `${file('text')}\nconst later = setTimeout(() => undefined, 500);\n`;
    assert.ok(mentions(run(checkCoalescing, { text }), 'deterministic edit boundary'));
  });

  it('rejects a text box that opens no session on focus', () => {
    const controls = replacing('controls', 'onFocus={onBeginEdit}', 'onFocusCapture={undefined}');
    assert.ok(mentions(run(checkCoalescing, { controls }), 'open and close an edit session'));
  });
});

describe('capability integration', () => {
  it('accepts the delivered call sites', () => {
    assert.deepEqual(run(checkIntegration), []);
  });

  it('rejects a layer command that names no action', () => {
    const layers = replacing('layers', "kind: 'reorder'", 'kind: undefined as never');
    assert.ok(mentions(run(checkIntegration, { layers }), 'reorder'));
  });

  it('rejects a commit that need not name itself', () => {
    const store = replacing('store', 'commit: (document, action) =>', 'commit: (document) =>');
    assert.ok(mentions(run(checkIntegration, { store }), 'does not require an action'));
  });

  it('rejects a group action arriving before a group capability', () => {
    const model = replacing('model', "| 'image-replace'", "| 'image-replace'\n  | 'group'");
    assert.ok(mentions(run(checkIntegration, { model }), 'group history action'));
  });
});

describe('side effects', () => {
  it('accepts the delivered history files', () => {
    assert.deepEqual(run(checkNoSideEffects), []);
  });

  it('rejects an autosave reached from an undo', () => {
    const hook = `${file('hook')}\nconst save = publicDesignSessionAutosave;\n`;
    assert.ok(mentions(run(checkNoSideEffects, { hook }), 'publicDesignSessionAutosave'));
  });

  it('rejects an Asset delete anywhere in the feature', () => {
    const hook = `${file('hook')}\nconst drop = () => publicDesignSessionAssetDelete();\n`;
    const failures = run(checkNoSideEffects, { hook });
    assert.ok(mentions(failures, 'Asset delete') || mentions(failures, 'publicDesignSessionAsset'));
  });

  it('rejects a re-upload on redo', () => {
    const hook = replacing(
      'hook',
      'redoDocument();',
      'redoDocument();\n    void fetch("/upload");',
    );
    assert.ok(mentions(run(checkNoSideEffects, { hook }), 'fetch('));
  });
});

describe('persistence', () => {
  it('accepts the delivered runtime-only history', () => {
    assert.deepEqual(run(checkNoPersistence), []);
  });

  it('rejects a history written to browser storage', () => {
    for (const store of ['localStorage', 'sessionStorage', 'indexedDB']) {
      const model = `${file('model')}\nexport const save = () => ${store}.setItem('h', '');\n`;
      assert.ok(mentions(run(checkNoPersistence, { model }), store), store);
    }
  });

  it('rejects a Session change that keeps the past', () => {
    const store = replacing(
      'store',
      '{ sessionKey, document, history: EMPTY_HISTORY, openAction: null }',
      '{ sessionKey, document }',
    );
    assert.ok(mentions(run(checkNoPersistence, { store }), 'clear the past'));
  });
});

describe('excluded state', () => {
  it('accepts the delivered separation', () => {
    assert.deepEqual(run(checkExcludedState), []);
  });

  it('rejects a selection, viewport or watermark value entering the history files', () => {
    for (const leak of ['selectedElementId', 'zoomStep', 'panXRatio', 'watermark']) {
      const model = `${file('model')}\nexport const leak = '${leak}' + ${leak};\n`;
      assert.ok(mentions(run(checkExcludedState, { model }), leak), leak);
    }
  });

  it('rejects a viewport value entering the store that holds the snapshots', () => {
    const store = `${file('store')}\nconst zoomStep = 0;\n`;
    assert.ok(mentions(run(checkExcludedState, { store }), 'zoomStep'));
  });
});

describe('the keyboard path', () => {
  it('accepts the delivered shortcuts', () => {
    assert.deepEqual(run(checkShortcuts), []);
  });

  it('rejects a third binding nothing authorizes', () => {
    const shortcuts = replacing(
      'shortcuts',
      "if (event.key.toLowerCase() !== 'z') return;",
      "if (event.key.toLowerCase() === 'y') { latest.current.redo(); return; }",
    );
    assert.ok(mentions(run(checkShortcuts, { shortcuts }), 'Ctrl+Y'));
  });

  it('rejects a keystroke answered twice', () => {
    const shortcuts = without('shortcuts', 'event.defaultPrevented');
    assert.ok(mentions(run(checkShortcuts, { shortcuts }), 'answered twice'));
  });

  it('rejects double-handling the platform text undo', () => {
    const shortcuts = replacing('shortcuts', 'if (isEditable(event.target)) return;', '');
    assert.ok(mentions(run(checkShortcuts, { shortcuts }), 'text undo'));
  });

  it('rejects a listener that outlives the Studio', () => {
    const shortcuts = without('shortcuts', 'removeEventListener');
    assert.ok(mentions(run(checkShortcuts, { shortcuts }), 'outlives'));
  });
});

describe('the panel', () => {
  it('accepts the delivered panel', () => {
    assert.deepEqual(run(checkPanel), []);
  });

  it('rejects unapproved time travel in the list', () => {
    const list = replacing(
      'list',
      '<span className="studio-history__label">{row.label}</span>',
      '<button type="button" onClick={() => undefined}>{row.label}</button>',
    );
    assert.ok(mentions(run(checkPanel, { list }), 'time travel'));
  });

  it('rejects an APP3-S11 mobile surface delivered early', () => {
    const panel = `${file('panel')}\nconst sheet = () => <div onTouchStart={undefined} />;\n`;
    assert.ok(mentions(run(checkPanel, { panel }), 'APP3-S11'));
  });

  it('rejects a second drawer beside the accepted one', () => {
    const panels = replacing(
      'panels',
      '<StudioHistoryPanel slot="drawer" history={history} />',
      '<StudioTextDrawer />',
    );
    assert.ok(mentions(run(checkPanel, { panels }), 'second drawer'));
  });

  it('rejects the mobile controls pulled forward into the rail', () => {
    const rail = `${file('rail')}\nconst sheet = () => <div className="bottom-sheet" />;\n`;
    assert.ok(mentions(run(checkPanel, { rail }), 'APP3-S11'));
  });
});

/**
 * Where the controls sit (`APP3-S08-C1` §7, §8, §15).
 *
 * The defect human review found was not that undo was missing — it worked — but
 * that it was in the wrong surface. Every mutation here is a way of putting it
 * back where the delivered checkpoint had it.
 */
describe('the control placement', () => {
  it('accepts the corrected placement', () => {
    assert.deepEqual(run(checkControlPlacement), []);
  });

  it('rejects a control moved out of the tool rail', () => {
    for (const control of ['studio-history-undo', 'studio-history-redo']) {
      const rail = file('rail').replaceAll(control, 'studio-history-elsewhere');
      assert.ok(mentions(run(checkControlPlacement, { rail }), control), control);
    }
  });

  it('rejects the controls duplicated in the history panel', () => {
    const list = replacing(
      'list',
      '<h2 className="studio-history__heading">{STUDIO_HISTORY_COPY.title}</h2>',
      '<button type="button" data-testid="studio-history-undo" onClick={undo} />',
    );
    assert.ok(mentions(run(checkControlPlacement, { list }), 'duplicated'));
  });

  it('rejects redo drawn before undo', () => {
    const rail = file('rail')
      .replaceAll('studio-history-undo', 'TEMP')
      .replaceAll('studio-history-redo', 'studio-history-undo')
      .replaceAll('TEMP', 'studio-history-redo');
    assert.ok(mentions(run(checkControlPlacement, { rail }), 'immediately follow'));
  });

  it('rejects a control that is not a real disabled button', () => {
    const rail = replacing('rail', 'disabled={!canUndo}', 'aria-disabled={!canUndo}');
    assert.ok(mentions(run(checkControlPlacement, { rail }), 'not really disabled'));
  });

  it('rejects a disabled control with no stated reason', () => {
    const rail = without('rail', 'aria-describedby');
    assert.ok(mentions(run(checkControlPlacement, { rail }), 'states no reason'));
  });

  it('rejects the controls collapsing into the drawer at 1024', () => {
    // `618:140`: the left tool rail stays and is always visible.
    const rail = replacing('rail', "tier === null || tier === 'mobile'", "tier !== 'desktop'");
    assert.ok(mentions(run(checkControlPlacement, { rail }), 'persist'));
  });

  it('rejects the rail mounted from the tablet drawer composition', () => {
    const panels = `${file('panels')}\nconst extra = () => <StudioHistoryRail />;\n`;
    assert.ok(mentions(run(checkControlPlacement, { panels }), 'tablet drawer'));
  });

  it('rejects the shortcut hint folded back into the panel', () => {
    const list = `${file('list')}\nconst hint = () => STUDIO_HISTORY_COPY.shortcutHeading;\n`;
    assert.ok(mentions(run(checkControlPlacement, { list }), 'folded back'));
  });
});

/** The baseline row and the one current marker (`APP3-S08-C1` §3, §4, §15). */
describe('the projection', () => {
  it('accepts the corrected projection', () => {
    assert.deepEqual(run(checkProjection), []);
  });

  it('rejects the baseline UI row removed', () => {
    const list = without('list', 'studio-history-baseline');
    assert.ok(mentions(run(checkProjection, { list }), 'baseline row'));
  });

  it('rejects a projection that publishes no baseline at all', () => {
    const model = without('model', "key: 'baseline'");
    assert.ok(mentions(run(checkProjection, { model }), 'no baseline row'));
  });

  it('rejects the baseline made undoable', () => {
    // Undo depth stops being the cursor alone the moment the baseline counts.
    const model = replacing('model', 'history.cursor > 0', 'history.cursor >= 0');
    assert.ok(mentions(run(checkProjection, { model }), 'undo depth'));
  });

  it('rejects a missing current marker at either end', () => {
    for (const [from, needle] of [
      ['current: history.cursor === 0', 'marker at the start'],
      ['current: index === history.cursor - 1', 'marker at cursor - 1'],
    ]) {
      const model = file('model').replaceAll(from, 'current: false');
      assert.ok(mentions(run(checkProjection, { model }), needle), needle);
    }
  });

  it('rejects more than one row claiming to be current', () => {
    const model = replacing('model', 'current: index === history.cursor - 1', 'current: true');
    assert.ok(mentions(run(checkProjection, { model }), 'marker at cursor - 1'));
  });

  it('rejects the future rows hidden after an undo', () => {
    for (const [key, mutated] of [
      [
        'model',
        file('model').replace(
          '...history.entries.map',
          '...history.entries.slice(0, history.cursor).map',
        ),
      ],
      ['list', file('list').replace('{rows.map(', '{rows.filter((row) => row.current).map(')],
    ]) {
      assert.ok(mentions(run(checkProjection, { [key]: mutated }), 'rows'), key);
    }
  });

  it('rejects the per-row applied status restored', () => {
    const list = replacing(
      'list',
      '{row.label}',
      '{row.label}{row.applied ? STUDIO_HISTORY_COPY.appliedFlag : null}',
    );
    assert.ok(mentions(run(checkProjection, { list }), 'per-row status'));
  });

  it('rejects the bare undone status returning as a published label', () => {
    const copy = replacing('copy', "currentBadge: 'hiện tại'", "undoneFlag: 'Đã hoàn tác'");
    assert.ok(mentions(run(checkProjection, { copy }), 'per-row status'));
  });

  it('accepts the live-region sentence that legitimately begins with it', () => {
    // `Đã hoàn tác: ${label}.` announces one undo; it is not a row label. A
    // substring ban would fail here, which is why the rule matches whole values.
    assert.ok(file('copy').includes('Đã hoàn tác:'));
    assert.deepEqual(run(checkProjection), []);
  });
});

/** What the baseline row is allowed to say (`APP3-S08-C1` §5). */
describe('the baseline copy', () => {
  it('accepts the delivered baseline', () => {
    assert.deepEqual(run(checkBaselineCopy), []);
  });

  it('rejects a slug or a version reaching the row as a name', () => {
    for (const identity of ['templateSlug', 'templateVersion']) {
      const model = `${file('model')}\nexport const shown = (l: { ${identity}: string }) => l.${identity};\n`;
      assert.ok(mentions(run(checkBaselineCopy, { model }), identity), identity);
    }
  });

  it('rejects a second bound on the name', () => {
    const model = replacing('model', 'LABEL_MAX_LENGTH', '24');
    assert.ok(mentions(run(checkBaselineCopy, { model }), 'second limit'));
  });

  it('rejects a blank baseline that invents its own label', () => {
    const copy = replacing('copy', 'STUDIO_COPY.startBlank', "'Thiết kế mới'");
    assert.ok(mentions(run(checkBaselineCopy, { copy }), 'invents its own label'));
  });

  it('rejects a name not proved to be this Session lineage', () => {
    const bootstrap = replacing(
      'bootstrap',
      'detail.detail?.slug === lineage.templateSlug',
      'detail.detail !== undefined',
    );
    assert.ok(mentions(run(checkBaselineCopy, { bootstrap }), "this Session's"));
  });

  it('rejects a second Template read added to decorate the row', () => {
    const bootstrap = `${file('bootstrap')}\nconst extra = useTemplateDetail(undefined, null);\n`;
    assert.ok(mentions(run(checkBaselineCopy, { bootstrap }), 'second Template read'));
  });
});

describe('safe labels', () => {
  it('accepts the delivered copy', () => {
    assert.deepEqual(run(checkSafeLabels), []);
  });

  it('rejects an identifier that could reach a row', () => {
    for (const identifier of ['assetId', 'derivativeId', 'sessionId']) {
      const model = `${file('model')}\nexport const name = (e: { ${identifier}: string }) => e.${identifier};\n`;
      assert.ok(mentions(run(checkSafeLabels, { model }), identifier), identifier);
    }
  });

  it('rejects a label derived without the bounded layer name', () => {
    for (const key of ['transform', 'text', 'image']) {
      const mutated = { [key]: file(key).replaceAll('layerLabel(', 'rawName(') };
      assert.ok(mentions(run(checkSafeLabels, mutated), 'bounded layer name'), key);
    }
  });

  it('rejects copy promising a capability this checkpoint lacks', () => {
    const copy = replacing('copy', "undo: 'Hoàn tác'", "undo: 'Hoàn tác — đã lưu'");
    assert.ok(mentions(run(checkSafeLabels, { copy }), 'promises a capability'));
  });
});

describe('ownership', () => {
  it('accepts the delivered partition', () => {
    assert.deepEqual(run(checkOwnership), []);
  });

  it('rejects a history built outside the files this checkpoint owns', () => {
    for (const construction of ['undoStack', 'historyStack', 'recordAction']) {
      const failures = run(checkOwnership, {
        [CANONICAL_FILES.screen]: `${file('screen')}\nconst ${construction} = [];\n`,
      });
      assert.ok(mentions(failures, construction), construction);
    }
  });
});

describe('immutability and the command index', () => {
  it('accepts the delivered artifacts', () => {
    assert.deepEqual(run(checkImmutability), []);
    assert.deepEqual(run(checkCommandIndex), []);
  });

  it('rejects a history dependency', () => {
    const manifest = file('manifest').replace(
      '"dependencies": {',
      '"dependencies": {\n    "zundo": "^2.0.0",',
    );
    assert.ok(mentions(run(checkImmutability, { manifest }), 'history dependency'));
  });

  it('rejects a history field entering the APP3-P01 schema', () => {
    const document = replacing(
      'document',
      'readonly elements: readonly DesignElement[];',
      'readonly elements: readonly DesignElement[];\n  readonly history: readonly string[];',
    );
    assert.ok(mentions(run(checkImmutability, { document }), 'schema'));
  });

  it('accepts the schema prose that names the undo stack to exclude it', () => {
    // `document.ts` explains in words that the undo stack is *not* document
    // state. A rule on the raw file would fail on that sentence — it did, on
    // this gate's first run — so the rule is on a declared field.
    assert.ok(file('document').includes('undo stack'));
    assert.deepEqual(run(checkImmutability), []);
  });

  it('rejects an unindexed scoped command', () => {
    for (const command of ['CMD-CHECK-APP3-S08', 'CMD-TEST-APP3-S08-STOREFRONT']) {
      const index = file('index').replaceAll(command, 'CMD-REMOVED');
      assert.ok(mentions(run(checkCommandIndex, { index }), command), command);
    }
  });

  it('rejects a checkpoint command added to the root manifest', () => {
    const root = JSON.parse(file('package.json'));
    root.scripts['check:app3-s08'] = 'node tools/check-app3-s08.mjs';
    const failures = run(checkCommandIndex, { 'package.json': JSON.stringify(root, null, 2) });
    assert.ok(mentions(failures, 'root scripts') || mentions(failures, 'root manifest'));
  });
});

describe('the whole gate against the real repository', () => {
  it('passes', () => {
    const failures = [];
    checkApp3S08(REPO_ROOT, (message) => failures.push(message));
    assert.deepEqual(failures, []);
  });
});
