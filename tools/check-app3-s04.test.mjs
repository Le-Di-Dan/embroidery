/**
 * Regressions for the `APP3-S04` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working panel** behind:
 *
 * - the renderer reversed so the list reads top-first "naturally", which makes
 *   the paint order disagree with `APP3-P01` while every screenshot looks right;
 * - a `zIndex` field added to the document, which is a second z-order that
 *   agrees with the array until the first refused candidate;
 * - rows keyed by array position, which re-binds every row on the one action
 *   this panel exists to perform;
 * - a reorder that also writes a transform or a `childIds` entry — a restack
 *   that quietly reparents;
 * - hide implemented as `opacity: 0`, which still paints, still hit-tests and
 *   still counts against every budget;
 * - the lock moved into CSS, which stops a mouse and stops nothing else;
 * - the P01 validation dropped, which commits whatever the helper produced;
 * - a group construction added, which is the capability this checkpoint
 *   explicitly could not authorize.
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
  checkApp3S04,
  checkCandidatePipeline,
  checkCommandIndex,
  checkComposition,
  checkDesignApproval,
  checkFlags,
  checkGroupNotInvented,
  checkIdentity,
  checkImmutability,
  checkOneOrder,
  checkPredecessors,
  checkReorder,
} from './check-app3-s04.mjs';
import { CANONICAL_FILES, FEATURE, REPO_ROOT, read } from './check-app3-s04.sources.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s04-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s04.mjs',
    'tools/check-app3-s04-runtime.mjs',
    'tools/check-app3-s04-status.mjs',
    'tools/check-app3-s04.sources.mjs',
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

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s04-case-'));
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

/**
 * One source file with **every** matching line deleted.
 *
 * `replaceAll`, not `replace`: a mutation that removes only the first matching
 * line leaves a second carrying the term, and the "mutation" leaves the property
 * intact — the failure `APP3-B06C` recorded and `APP3-S06` inherited.
 */
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
      'APP3-S02 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-S03-C1 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-S06-C1 = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  /*
   * The group ruling has to survive in the status.
   *
   * Nothing in the delivered source says "grouping was considered and refused" —
   * an absent capability and an unfinished one look identical — so dropping the
   * line is exactly how a later reader concludes the roadmap row was satisfied.
   */
  it('rejects a status that drops the group ruling', () => {
    for (const line of [
      'APP3-S04 GROUP = BLOCKED',
      'APP3-S04 GROUP_FRAME = NOT_AUTHORIZED',
      'APP3-S04 GROUP_MEMBER_SELECTION = NOT_AUTHORIZED',
      'APP3-S04 ZORDER = P01_ARRAY_ORDER',
    ]) {
      const phase = file('phase').replace(`\n${line}`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects a bare COMPLETE that reads as though grouping shipped', () => {
    const phase = file('phase').replace(
      'APP3-S04 = COMPLETE — REVIEW_DELIVERED — GROUP_BLOCKED',
      'APP3-S04 = COMPLETE — REVIEW_DELIVERED',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'legitimate status'));
  });

  it('refuses a later Studio capability recorded complete', () => {
    for (const later of ['APP3-S08', 'APP3-S09', 'APP3-S11']) {
      const phase = `${file('phase')}\n${later} = COMPLETE — REVIEW_DELIVERED\n`;
      assert.ok(mentions(run(checkPredecessors, { phase }), later), later);
    }
  });
});

describe('design approval stays scoped', () => {
  it('accepts the three approved rows', () => {
    assert.deepEqual(run(checkDesignApproval), []);
  });

  it('refuses an unapproved S04 row', () => {
    const registry = file('registry').replace(
      '| FIG-STUDIO-LAYERS-DESKTOP-REORDER | Storefront | Studio layers | Layers Panel | Reordering | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION',
      '| FIG-STUDIO-LAYERS-DESKTOP-REORDER | Storefront | Studio layers | Layers Panel | Reordering | Desktop 1440 | high-fidelity | REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'not approved'));
  });

  it('refuses a row that resolves to a different node', () => {
    const registry = file('registry').replaceAll('| 608:68 |', '| 608:69 |');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'does not resolve to node'));
  });

  it('refuses re-attributing the 1024 reference to this checkpoint', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*)APP3-D01-C1/,
      '$1APP3-S04',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 're-attributed'));
  });
});

describe('one order', () => {
  it('accepts the delivered feature', () => {
    assert.deepEqual(run(checkOneOrder), []);
  });

  it('refuses a second z-order representation', () => {
    const model = `${file('model')}\nexport const zIndexOf = (n: number) => n;\n`;
    assert.ok(mentions(run(checkOneOrder, { model }), 'second z-order'));
  });

  it('refuses a renderer reversed to make the list easier', () => {
    const scene = replacing(
      'scene',
      'for (const element of document.elements) {',
      'for (const element of [...document.elements].reverse()) {',
    );
    assert.ok(mentions(run(checkOneOrder, { scene }), 're-ranked'));
  });

  it('refuses a list ranked by anything but P01 order', () => {
    const model = replacing('model', 'return rows.reverse();', 'return rows.sort();');
    assert.ok(mentions(run(checkOneOrder, { model }), 'not the document order reversed'));
  });

  it('refuses a fourth Studio store', () => {
    const root = rootWith();
    writeFileSync(join(root, FEATURE, 'store', 'studio-layer.store.ts'), 'export const x = 1;\n');
    const failures = [];
    checkOneOrder(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'a fourth Studio store'));
  });

  it('refuses a document held in the interaction store', () => {
    const interaction = `${file('interaction')}\nexport type Held = DesignDocument;\n`;
    assert.ok(mentions(run(checkOneOrder, { interaction }), 'holds a document'));
  });
});

describe('stable identity', () => {
  it('accepts the delivered list', () => {
    assert.deepEqual(run(checkIdentity), []);
  });

  it('refuses a row keyed by its array position', () => {
    const list = replacing('list', 'key={row.id}', 'key={index}');
    assert.ok(mentions(run(checkIdentity, { list }), 'keyed by'));
  });

  it('refuses an internal identifier rendered as copy', () => {
    const list = replacing(
      'list',
      '<span className="studio-layers__name">{row.label}</span>',
      '<span className="studio-layers__name">{row.label}{row.id}</span',
    );
    assert.ok(mentions(run(checkIdentity, { list }), 'internal identifier'));
  });

  it('refuses a label cut by UTF-16 unit', () => {
    const model = replacing('model', 'const points = [...trimmed];', 'const points = trimmed;');
    assert.ok(mentions(run(checkIdentity, { model }), 'code point'));
  });
});

describe('reorder', () => {
  it('accepts the delivered reorder', () => {
    assert.deepEqual(run(checkReorder), []);
  });

  it('refuses a reorder that also writes a transform', () => {
    const model = replacing(
      'model',
      '  elements.splice(to, 0, moved);',
      '  elements.splice(to, 0, { ...moved, transform: moved.transform });',
    );
    assert.ok(mentions(run(checkReorder, { model }), 'changes "transform"'));
  });

  it('refuses a drop that reparents', () => {
    const model = replacing(
      'model',
      '  elements.splice(to, 0, moved);',
      '  elements.splice(to, 0, moved);\n  const claimed = { childIds: [elementId] };\n  void claimed;',
    );
    assert.ok(mentions(run(checkReorder, { model }), 'changes "childIds"'));
  });

  it('refuses a drag-only reorder', () => {
    const list = without('list', 'layers.step(');
    assert.ok(mentions(run(checkReorder, { list }), 'keyboard-operable'));
  });

  it('refuses a missing drop indicator', () => {
    const list = without('list', 'data-drop=');
    assert.ok(mentions(run(checkReorder, { list }), 'drop indicator'));
  });

  it('refuses a boundary control disabled from something other than the state', () => {
    const list = replacing('list', 'disabled={reason !== null}', 'disabled={false}');
    assert.ok(mentions(run(checkReorder, { list }), 'disabled from the real state'));
  });

  it('refuses a disabled control that does not say why', () => {
    const list = without('list', 'aria-describedby');
    assert.ok(mentions(run(checkReorder, { list }), 'does not say why'));
  });

  it('refuses a restack nobody is told about', () => {
    const hook = without('hook', 'setAnnouncement');
    assert.ok(mentions(run(checkReorder, { hook }), 'produces the announcement'));
  });
});

describe('lock and hide', () => {
  it('accepts the delivered flags', () => {
    assert.deepEqual(run(checkFlags), []);
  });

  it('refuses hide implemented as an opacity', () => {
    const model = replacing(
      'model',
      'element.visible === visible ? null : { ...element, visible },',
      'element.visible === visible ? null : { ...element, opacity: visible ? 1 : 0 },',
    );
    assert.ok(mentions(run(checkFlags, { model }), 'hide is implemented as'));
  });

  it('refuses hide implemented as a delete', () => {
    const model = replacing(
      'model',
      'element.visible === visible ? null : { ...element, visible },',
      'element.visible === visible ? null : (element.slice() as never),',
    );
    assert.ok(mentions(run(checkFlags, { model }), 'hide is implemented as'));
  });

  it('refuses a lock that is a CSS rule', () => {
    const styles = replacing(
      'styles',
      '.studio-layers__item {\n  display: flex;',
      '.studio-layers__item {\n  pointer-events: none;\n  display: flex;',
    );
    assert.ok(mentions(run(checkFlags, { styles }), 'lock is a CSS rule'));
  });

  it('refuses locking a group by rewriting its children', () => {
    const model = replacing(
      'model',
      'export function withElementLocked(\n  document: DesignDocument,',
      'export function withElementLocked(\n  /* childIds */\n  document: DesignDocument,',
    ).replace('/* childIds */', 'childIds,');
    assert.ok(mentions(run(checkFlags, { model }), 'rewrites its children'));
  });

  it('refuses leaving a hidden selection holding handles', () => {
    const hook = without('hook', 'clearSelection()');
    assert.ok(mentions(run(checkFlags, { hook }), 'reconcile the selection'));
  });
});

describe('the candidate pipeline', () => {
  it('accepts the delivered pipeline', () => {
    assert.deepEqual(run(checkCandidatePipeline), []);
  });

  it('refuses a candidate committed without P01', () => {
    const hook = replacing(
      'hook',
      'const structure = validateDesignDocumentStructure(candidate);',
      'const structure = { ok: true, value: candidate } as const;',
    );
    assert.ok(mentions(run(checkCandidatePipeline, { hook }), 'without APP3-P01'));
  });

  it('refuses committing something other than the validated document', () => {
    const hook = replacing('hook', 'commit(structure.value);', 'commit(candidate);');
    assert.ok(mentions(run(checkCandidatePipeline, { hook }), 'not the validated one'));
  });

  it('refuses a layer action that saves, times or remembers', () => {
    for (const [needle, added] of [
      ['setInterval', 'setInterval(() => undefined, 1000);'],
      ['undoStack', 'const undoStack: unknown[] = [];'],
      ['publicDesignSessionAutosave', 'void publicDesignSessionAutosave;'],
    ]) {
      const hook = `${file('hook')}\n${added}\n`;
      assert.ok(mentions(run(checkCandidatePipeline, { hook }), needle), needle);
    }
  });
});

describe('grouping is not invented', () => {
  it('accepts the delivered feature', () => {
    assert.deepEqual(run(checkGroupNotInvented), []);
  });

  it('refuses a group construction', () => {
    const model = `${file('model')}\nconst made = { type: 'group' as const, childIds: [] };\nvoid made;\n`;
    assert.ok(mentions(run(checkGroupNotInvented, { model }), 'builds it'));
  });

  it('refuses a member accumulator', () => {
    const hook = `${file('hook')}\nconst selectedElementIds: string[] = [];\nvoid selectedElementIds;\n`;
    assert.ok(mentions(run(checkGroupNotInvented, { hook }), 'builds it'));
  });

  it('refuses a coordinate rebase inside the layer capability', () => {
    const model = `${file('model')}\nimport { invertMatrix } from '@embroidery/design-engine';\nvoid invertMatrix;\n`;
    assert.ok(mentions(run(checkGroupNotInvented, { model }), 'rebases coordinates'));
  });

  /*
   * The rebase ban is scoped, and the scope is the point.
   *
   * `APP3-S03` inverts a matrix for a legitimate reason — turning a pointer
   * position into element-local space — and a feature-wide ban fired on that
   * accepted capability rather than on a group rebase. This proves the accepted
   * use still passes.
   */
  it('leaves the accepted S03 matrix inversion alone', () => {
    assert.ok(!mentions(run(checkGroupNotInvented), 'invertMatrix'));
  });
});

describe('composition', () => {
  it('accepts the delivered composition', () => {
    assert.deepEqual(run(checkComposition), []);
  });

  it('refuses a mobile surface that is hidden rather than not rendered', () => {
    const panel = replacing(
      'panel',
      "if (tier === 'mobile') {",
      "if (tier === 'never') {\n    return <div aria-hidden=\"true\" />;\n  }\n  if (tier === 'mobile') {",
    );
    assert.ok(mentions(run(checkComposition, { panel }), 'hidden rather than not rendered'));
  });

  it('refuses a panel that does not use the accepted drawer', () => {
    const panel = replacing('panel', "if (tier === 'tablet')", "if (tier === 'desktop2')");
    assert.ok(mentions(run(checkComposition, { panel }), 'accepted drawer'));
  });

  it('refuses a second drawer component', () => {
    const root = rootWith();
    writeFileSync(
      join(root, FEATURE, 'components', 'studio-layers-drawer.tsx'),
      'export const X = 1;\n',
    );
    const failures = [];
    checkComposition(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'exactly one drawer component'));
  });

  it('refuses an S11 mobile sheet or a second renderer', () => {
    for (const [needle, added] of [
      ['bottom-sheet', "const sheet = 'bottom-sheet';\nvoid sheet;"],
      ['<canvas', 'const c = <canvas />;\nvoid c;'],
    ]) {
      const list = `${file('list')}\n${added}\n`;
      assert.ok(mentions(run(checkComposition, { list }), needle), needle);
    }
  });
});

describe('the artifacts and the command index', () => {
  it('accepts the registered commands', () => {
    assert.deepEqual(run(checkCommandIndex), []);
  });

  it('refuses an unregistered command', () => {
    for (const id of ['CMD-CHECK-APP3-S04', 'CMD-TEST-APP3-S04-STOREFRONT']) {
      const index = file('index').replaceAll(id, 'CMD-REMOVED');
      assert.ok(mentions(run(checkCommandIndex, { index }), id), id);
    }
  });

  it('refuses an interaction library', () => {
    const manifest = file('manifest').replace(
      '"dependencies": {',
      '"dependencies": {\n    "dnd-kit": "^1.0.0",',
    );
    assert.ok(mentions(run(checkImmutability, { manifest }), 'interaction library'));
  });
});

describe('the whole gate', () => {
  it('passes against the real repository', () => {
    const failures = [];
    checkApp3S04(REPO_ROOT, (message) => failures.push(message));
    assert.deepEqual(failures, []);
  });
});
