/**
 * Regressions for the `APP3-S11` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working mobile editor** behind:
 *
 * - the arbitration decided by movement rather than by count, which feels fine
 *   until the customer who meant to pan moves their design instead;
 * - the touch listeners moved from capture to bubble, which works for every
 *   gesture that starts on empty canvas and silently mis-counts every one that
 *   starts on an element;
 * - a pinch that computes a scale, which is correct on Chromium and restores the
 *   41 ms WebKit frame `ADR-APP0-001` measured;
 * - a viewport gesture that commits a document, which pans and zooms perfectly
 *   and quietly writes a design the customer never edited;
 * - a second finger that leaves the drag open, so one gesture becomes two
 *   entries or none;
 * - a transform press that skips `APP3-P02`, or clamps its refusal, which is the
 *   `IMP-D045` PO-09 repair wearing a numeric control;
 * - a millimetre button that writes `width`, which resizes three of the five
 *   element kinds and silently does nothing to the other two;
 * - a sheet that leaks focus, or a conflict that can be tapped away;
 * - a mobile toolbar hidden rather than absent, which is still focusable and
 *   still fires on a desktop.
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
  checkApp3S11,
  checkArbitration,
  checkCommandIndex,
  checkComposition,
  checkConflictProjection,
  checkDesignApproval,
  checkImmutability,
  checkKeyboard,
  checkPinch,
  checkPredecessors,
  checkSheets,
  checkTargets,
  checkTransformSheet,
  checkUntouched,
  checkViewportOnly,
} from './check-app3-s11.mjs';
import { CANONICAL_FILES, FEATURE, REPO_ROOT, read } from './check-app3-s11.sources.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

/**
 * The exact line `APP3-S11` is recorded under, named once.
 *
 * A `.replace` whose target has moved passes while proving nothing — the failure
 * `APP3-S08-C1` recorded three times over and `APP3-S10` twice more, and the
 * reason this is a constant rather than a literal repeated at each call site.
 */
const S11_STATUS_LINE = '\nAPP3-S11 = COMPLETE — REVIEW_DELIVERED\n';

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s11-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s11.mjs',
    'tools/check-app3-s11-runtime.mjs',
    'tools/check-app3-s11.sources.mjs',
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
  const root = mkdtempSync(join(tmpdir(), 'app3-s11-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

function run(check, overrides) {
  const failures = [];
  check(rootWith(overrides), (message) => failures.push(message));
  return failures;
}

/** One source file with a substring replaced, asserting the target was there. */
function replacing(key, from, to) {
  const source = file(key);
  assert.ok(source.includes(from), `no source contains "${from}"`);
  return source.replaceAll(from, to);
}

/** One source file with a substring removed, asserting the target was there. */
function without(key, from) {
  return replacing(key, from, '');
}

/* -------------------------------------------------------------------------- */

describe('predecessors and status', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkPredecessors, {}), []);
  });

  it('refuses a predecessor that is not accepted', () => {
    const phase = file('phase').replace(
      '\nAPP3-S10 = COMPLETE — REVIEW_ACCEPTED\n',
      '\nAPP3-S10 = COMPLETE — REVIEW_DELIVERED\n',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-S10'));
  });

  it('refuses a status this checkpoint may not be recorded under', () => {
    const phase = file('phase').replace(S11_STATUS_LINE, '\nAPP3-S11 = SELF_ACCEPTED\n');
    assert.ok(mentions(run(checkPredecessors, { phase }), 'legitimate status'));
  });

  it('refuses a later capability recorded complete here', () => {
    const phase = file('phase').replace(
      S11_STATUS_LINE,
      `${S11_STATUS_LINE}APP3-E01 = COMPLETE — REVIEW_DELIVERED\n`,
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-E01'));
  });

  it('refuses the cadence or the autosave UI moved to this checkpoint', () => {
    for (const owner of ['AUTOSAVE_UI_OWNER = APP3-S10', 'AUTOSAVE_CADENCE_OWNER = APP3-S10']) {
      // `replaceAll`: the roadmap reconciliation quotes both lines in prose above
      // the status block, and a `replace` would rewrite the quotation and leave
      // the line the gate actually reads untouched.
      const phase = file('phase').replaceAll(owner, owner.replace('APP3-S10', 'APP3-S11'));
      assert.ok(mentions(run(checkPredecessors, { phase }), owner), owner);
    }
  });

  it('refuses the mobile ownership handed away', () => {
    const phase = file('phase').replaceAll(
      'MOBILE_TOUCH_OWNER = APP3-S11',
      'MOBILE_TOUCH_OWNER = APP3-E01',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'MOBILE_TOUCH_OWNER'));
  });

  it('refuses a carried follow-up closed by this checkpoint', () => {
    for (const carried of [
      'FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01 = OPEN',
      'FU-APP3-TRANSFORM-BUDGET-01 = OPEN',
    ]) {
      const phase = file('phase').replaceAll(carried, carried.replace('OPEN', 'COMPLETE'));
      assert.ok(mentions(run(checkPredecessors, { phase }), carried), carried);
    }
  });

  it('refuses a recorded ruling being dropped', () => {
    for (const line of [
      'APP3-S11 PINCH = DISCRETE_STEP_NEVER_A_SCALE',
      'APP3-S11 TRANSFORM_READOUT = MEASURED_NOT_ECHOED',
      'APP3-S11 CONFLICT_SHEET = S10_DECISION_RELOCATED',
    ]) {
      const phase = file('phase').replace(`\n${line}`, '\nAPP3-S11 SOMETHING_ELSE = X');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });
});

describe('design approval stays scoped', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkDesignApproval, {}), []);
  });

  it('refuses a consumed row that is not approved', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-MOBILE-TEXTSHEET \|[^\n]*?)APPROVED_FOR_IMPLEMENTATION/,
      '$1REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'FIG-STUDIO-MOBILE-TEXTSHEET'));
  });

  it('refuses a consumed row whose node id was changed', () => {
    const registry = file('registry').replace('| 610:294 |', '| 610:999 |');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'node 610:294'));
  });

  it('refuses a row approved without this checkpoint as its evidence', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-MOBILE-CONFLICT \|[^\n]*?)APP3-S11 §4 operator review/,
      '$1—',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'approval evidence'));
  });

  it('refuses a blanket approval', () => {
    // Every capability row belongs to an opened checkpoint now, so the row this
    // fires on is the handoff annotation: no capability checkpoint consumes it,
    // and a blanket approval still moves it.
    const registry = file('registry').replaceAll('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'FIG-APP3-HANDOFF-DEPENDENCY'));
  });

  it('refuses a foreign row claimed as this checkpoint`s evidence', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED \|[^\n]*?)APP3-S10 §3 operator review/,
      '$1APP3-S11 §4 operator review',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'APP3-S11 evidence'));
  });

  it('refuses the shared 1024 reference re-attributed here', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*?)APP3-D01-C1/,
      '$1APP3-S11',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), '1024 reference'));
  });
});

describe('the arbitration', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkArbitration, {}), []);
  });

  it('refuses an arbitration that is not a function of the touch count', () => {
    const touch = replacing(
      'touch',
      "return touchCount === 1 ? 'element' : 'viewport';",
      "return 'element';",
    );
    assert.ok(mentions(run(checkArbitration, { touch }), 'one finger is not the element'));
  });

  it('refuses the gesture kind inferred somewhere other than the count', () => {
    const gestures = replacing(
      'gestures',
      "gestureKindFor(touches.current.size) === 'viewport'",
      'movedFarEnough',
    );
    assert.ok(mentions(run(checkArbitration, { gestures }), 'decided by the touch count'));
  });

  it('refuses a drag left open when the second finger lands', () => {
    const gestures = without('gestures', 'latest.current.transform.cancelGesture();');
    assert.ok(mentions(run(checkArbitration, { gestures }), 'not closed when the second finger'));
  });

  it('refuses the arbitration moved to the bubble phase', () => {
    // The mutation that works for every gesture starting on empty canvas and
    // silently mis-counts every one that starts on an element.
    const viewport = replacing(
      'viewport',
      'onPointerDownCapture={touch?.onPointerDown}',
      'onPointerDownBubble={touch?.onPointerDown}',
    );
    assert.ok(mentions(run(checkArbitration, { viewport }), 'cannot see a finger on an element'));
  });

  it('refuses a contact that is never forgotten', () => {
    const gestures = without('gestures', 'touches.current.delete(event.pointerId);');
    assert.ok(mentions(run(checkArbitration, { gestures }), 'never forgotten'));
  });

  it('refuses live pointers surviving the unmount', () => {
    const gestures = without('gestures', 'touches.current.clear();');
    assert.ok(mentions(run(checkArbitration, { gestures }), 'released on unmount'));
  });
});

describe('the pinch', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkPinch, {}), []);
  });

  it('refuses a pinch that does not resolve to a frozen step', () => {
    const touch = replacing('touch', 'return nearestStep(target);', 'return target;');
    assert.ok(mentions(run(checkPinch, { touch }), 'frozen zoom step'));
  });

  it('refuses a pinch that stops reading the accepted zoom list', () => {
    const touch = replacing('touch', 'ZOOM_STEPS', 'LOCAL_STEPS');
    assert.ok(mentions(run(checkPinch, { touch }), 'accepted APP3-S07 zoom list'));
  });

  it('refuses a viewport driven by anything but a step', () => {
    const gestures = replacing('gestures', 'setZoomStep(', 'setZoomScale(');
    assert.ok(mentions(run(checkPinch, { gestures }), 'not drive the viewport by step'));
  });

  it('refuses a zoom setter that stops clamping to the list', () => {
    const viewportStore = replacing('viewportStore', 'clampStep(zoomStep)', 'zoomStep');
    assert.ok(mentions(run(checkPinch, { viewportStore }), 'clamped step index'));
  });

  it('refuses a scale computed anywhere in the feature', () => {
    const gestures = `${file('gestures')}\nconst next = zoomStep * ratio;\n`;
    assert.ok(mentions(run(checkPinch, { gestures }), 'computed rather than chosen'));
  });

  it('refuses a ratio that is not measured from the gesture start', () => {
    const touch = replacing('touch', 'separationPx / startSeparationPx', 'separationPx / lastPx');
    assert.ok(mentions(run(checkPinch, { touch }), "measured from the gesture's start"));
  });
});

describe('a viewport gesture touches the camera and nothing else', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkViewportOnly, {}), []);
  });

  it('refuses a document seam reached from the gesture hook', () => {
    for (const seam of ['useStudioDocumentStore', 'beginAction', 'recordAction']) {
      const gestures = `${file('gestures')}\nconst reach = ${seam};\n`;
      assert.ok(mentions(run(checkViewportOnly, { gestures }), seam), seam);
    }
  });

  it('refuses the two-finger pan leaving the accepted store', () => {
    const gestures = replacing('gestures', 'panByPixels(', 'panByPixelsLocal(');
    assert.ok(mentions(run(checkViewportOnly, { gestures }), 'accepted store'));
  });

  it('refuses a PointerEvent reaching a store or a pure model', () => {
    const touch = `${file('touch')}\nexport type Held = PointerEvent;\n`;
    assert.ok(mentions(run(checkViewportOnly, { touch }), 'PointerEvent reached'));
  });
});

describe('the transform sheet', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkTransformSheet, {}), []);
  });

  it('refuses a press that skips the APP3-P02 authority', () => {
    const transformSheet = replacing('transformSheet', 'ruleOnCandidate(', 'acceptCandidate(');
    assert.ok(mentions(run(checkTransformSheet, { transformSheet }), 'APP3-P02 authority'));
  });

  it('refuses a refused candidate that is repaired rather than abandoned', () => {
    for (const repair of ['Math.min(', 'clamp']) {
      const transformSheet = `${file('transformSheet')}\nconst repaired = ${repair}1, 2);\n`;
      assert.ok(mentions(run(checkTransformSheet, { transformSheet }), repair), repair);
    }
  });

  it('refuses a millimetre button that writes something other than scale', () => {
    const mobileTransform = replacing(
      'mobileTransform',
      'scaleX: start.scaleX * factor',
      'width: start.width * factor',
    );
    assert.ok(mentions(run(checkTransformSheet, { mobileTransform }), 'other than scale'));
  });

  it('refuses a read-out that is echoed rather than measured', () => {
    const mobileTransform = replacing('mobileTransform', 'getElementBounds(', 'echoRequested(');
    assert.ok(mentions(run(checkTransformSheet, { mobileTransform }), 'measured by APP3-P02'));
  });

  it('refuses a hidden or locked element becoming transformable', () => {
    const transformSheet = replacing(
      'transformSheet',
      'element.visible && !element.locked',
      'true',
    );
    assert.ok(mentions(run(checkTransformSheet, { transformSheet }), 'hidden or locked'));
  });
});

describe('the sheets', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkSheets, {}), []);
  });

  it('refuses a sheet that is not a modal dialog', () => {
    for (const required of ['role="dialog"', 'aria-modal="true"']) {
      const sheet = without('sheet', required);
      assert.ok(mentions(run(checkSheets, { sheet }), 'modal dialog'), required);
    }
  });

  it('refuses focus that never returns to the invoking control', () => {
    const sheet = without('sheet', 'opener.current?.focus();');
    assert.ok(mentions(run(checkSheets, { sheet }), 'focus does not return'));
  });

  it('refuses focus that escapes backwards', () => {
    const sheet = replacing('sheet', 'event.shiftKey && document.activeElement === first', 'false');
    assert.ok(mentions(run(checkSheets, { sheet }), 'Shift+Tab is not contained'));
  });

  it('refuses Escape closing a decision that may not be dismissed', () => {
    const sheet = replacing(
      'sheet',
      "event.key === 'Escape' && dismissible",
      "event.key === 'Escape'",
    );
    assert.ok(mentions(run(checkSheets, { sheet }), 'may not be dismissed'));
  });

  it('refuses a clickable div as the scrim', () => {
    const sheet = replacing(
      'sheet',
      '<button\n        aria-hidden="true"\n        className="studio-sheet__scrim"',
      '<div\n        aria-hidden="true"\n        className="studio-sheet__scrim"',
    );
    assert.ok(mentions(run(checkSheets, { sheet }), 'clickable div'));
  });

  it('refuses a dismissible conflict', () => {
    const surface = replacing('surface', 'dismissible={false}', 'dismissible={true}');
    assert.ok(mentions(run(checkSheets, { surface }), 'can be dismissed'));
  });

  it('refuses a close control on a sheet that may not be closed', () => {
    const sheet = replacing('sheet', '{dismissible ? (', '{true ? (');
    assert.ok(mentions(run(checkSheets, { sheet }), 'still draws a close control'));
  });

  it('refuses more than one sheet open at once', () => {
    const sheets = replacing(
      'sheets',
      'useState<StudioSheetName | null>(null)',
      'useState<StudioSheetName[]>([])',
    );
    assert.ok(mentions(run(checkSheets, { sheets }), 'more than one sheet'));
  });
});

describe('the conflict stays APP3-S10`s, relocated', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkConflictProjection, {}), []);
  });

  it('refuses a conflict action that is not the accepted one', () => {
    const surface = replacing('surface', 'save.loadLatest', 'save.reload');
    assert.ok(mentions(run(checkConflictProjection, { surface }), 'save.loadLatest'));
  });

  it('refuses a third way out of the conflict', () => {
    for (const invented of ['merge', 'saveAsCopy']) {
      const surface = `${file('surface')}\nconst ${invented} = () => undefined;\n`;
      assert.ok(mentions(run(checkConflictProjection, { surface }), invented), invented);
    }
  });

  it('refuses the conflict asked twice at 390', () => {
    const saveState = replacing('saveState', 'conflict && suppressConflict', 'false');
    assert.ok(mentions(run(checkConflictProjection, { saveState }), 'not suppressed at 390'));
  });

  it('refuses the screen forgetting to suppress the desktop region', () => {
    const stageScreen = replacing('stageScreen', 'suppressConflict={mobile}', '');
    assert.ok(mentions(run(checkConflictProjection, { stageScreen }), 'does not suppress'));
  });

  it('refuses the mobile UI saving for itself', () => {
    for (const direct of ['mobileAutosave', 'touchAutosave']) {
      const surface = `${file('surface')}\nconst ${direct} = () => undefined;\n`;
      assert.ok(mentions(run(checkConflictProjection, { surface }), direct), direct);
    }
  });

  it('refuses the autosave operation called from a mobile file', () => {
    const surface = `${file('surface')}\nvoid publicDesignSessionAutosave;\n`;
    assert.ok(mentions(run(checkConflictProjection, { surface }), 'saves for itself'));
  });
});

describe('the 390 composition', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkComposition, {}), []);
  });

  it('refuses a composition that is not decided by tier', () => {
    const stageScreen = replacing('stageScreen', 'useStudioViewportTier()', 'alwaysMobile()');
    assert.ok(mentions(run(checkComposition, { stageScreen }), 'decided by tier'));
  });

  it('refuses the mobile surface mounted at every tier', () => {
    const stageScreen = replacing(
      'stageScreen',
      '{mobile ? (\n            <StudioMobileSurface',
      '{true ? (\n            <StudioMobileSurface',
    );
    assert.ok(mentions(run(checkComposition, { stageScreen }), 'mounted at the mobile tier'));
  });

  it('refuses a mobile surface hidden rather than not rendered', () => {
    const toolbar = `${file('toolbar')}\nconst hide = 'display: none';\n`;
    assert.ok(mentions(run(checkComposition, { toolbar }), 'hidden rather than not rendered'));
  });

  it('refuses a second mobile toolbar', () => {
    const saveState = `${file('saveState')}\nconst second = 'studio-mobile-toolbar';\n`;
    assert.ok(mentions(run(checkComposition, { saveState }), 'second mobile toolbar'));
  });

  it('refuses the text tool becoming a create control', () => {
    const toolbar = `${file('toolbar')}\nconst addText = () => undefined;\n`;
    assert.ok(mentions(run(checkComposition, { toolbar }), 'create control'));
  });

  it('refuses a text tool that is never disabled', () => {
    const toolbar = replacing('toolbar', 'disabled={!canEditText}', 'disabled={false}');
    assert.ok(mentions(run(checkComposition, { toolbar }), 'not disabled without an editable'));
  });

  it('refuses a group control arriving without authority', () => {
    const layersSheet = `${file('layersSheet')}\nconst onGroup = () => undefined;\n`;
    assert.ok(mentions(run(checkComposition, { layersSheet }), 'without authority'));
  });
});

describe('targets, names and page scroll', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkTargets, {}), []);
  });

  it('refuses a control that drops the shared touch-target minimum', () => {
    const styles = replacing(
      'styles',
      'min-width: styles.$size-touch-target-min;\n  min-height: styles.$size-touch-target-min;\n  border: 1px solid styles.$color-border-primary;\n  border-radius: styles.$radius-button;\n  background: styles.$color-surface-primary;\n  color: styles.$color-text-primary;\n  font-family: inherit;\n  font-size: styles.$font-size-body-m;\n  cursor: pointer;\n\n  &:disabled {\n    cursor: default;\n    color: styles.$color-text-tertiary;\n  }\n}\n\n.studio-transform-sheet__value',
      'min-width: 40px;\n  min-height: 40px;\n}\n\n.studio-transform-sheet__value',
    );
    assert.ok(mentions(run(checkTargets, { styles }), 'touch-target minimum'));
  });

  it('refuses the stage giving up the gestures it answers', () => {
    const styles = replacing('styles', "[data-touch='true']", "[data-touch='never']");
    assert.ok(mentions(run(checkTargets, { styles }), 'claim the touch gestures'));
  });

  it('refuses page scrolling disabled globally', () => {
    const styles = `${file('styles')}\nbody {\n  touch-action: none;\n}\n`;
    assert.ok(mentions(run(checkTargets, { styles }), 'disabled globally'));
  });

  it('refuses a toolbar control with no accessible name', () => {
    const toolbar = replacing('toolbar', 'aria-label={label}', 'title={label}');
    assert.ok(mentions(run(checkTargets, { toolbar }), 'no accessible name'));
  });

  it('refuses a glyph published as a name', () => {
    const copy = replacing('copy', "undo: 'Hoàn tác',", "undo: '↶',");
    assert.ok(mentions(run(checkTargets, { copy }), 'decoration'));
  });
});

describe('the keyboard inset', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkKeyboard, {}), []);
  });

  it('refuses an assumed keyboard height', () => {
    const keyboard = replacing(
      'keyboard',
      'window.innerHeight - (viewport.height + viewport.offsetTop)',
      '320',
    );
    assert.ok(mentions(run(checkKeyboard, { keyboard }), 'assumed rather than measured'));
  });

  it('refuses listeners that are never removed', () => {
    const keyboard = replacing('keyboard', 'removeEventListener', 'ignoreEventListener');
    assert.ok(mentions(run(checkKeyboard, { keyboard }), 'never removed'));
  });

  it('refuses a browser without VisualViewport being ignored', () => {
    const keyboard = replacing('keyboard', 'if (!viewport) return;', '');
    assert.ok(mentions(run(checkKeyboard, { keyboard }), 'without VisualViewport'));
  });
});

describe('what a phone may not change', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkUntouched, {}), []);
  });

  it('refuses a second renderer', () => {
    const sheet = `${file('sheet')}\nconst second = <svg />;\n`;
    assert.ok(mentions(run(checkUntouched, { sheet }), '<svg> roots'));
  });

  it('refuses a canvas', () => {
    const sheet = `${file('sheet')}\nconst raster = <canvas />;\n`;
    assert.ok(mentions(run(checkUntouched, { sheet }), 'renders a canvas'));
  });

  it('refuses the watermark dropped', () => {
    const watermark = `${FEATURE}/components/studio-stage-watermark.tsx`;
    const renamed = (read(REPO_ROOT, watermark) ?? '').replaceAll(
      'StudioStageWatermark',
      'NoWatermark',
    );
    const stageScreen = replacing('stageScreen', 'StudioStageWatermark', 'NoWatermark');
    assert.ok(
      mentions(run(checkUntouched, { stageScreen, [watermark]: renamed }), 'no longer rendered'),
    );
  });

  it('refuses an export path', () => {
    for (const exportish of ['toDataURL', 'saveAs']) {
      const surface = `${file('surface')}\nconst out = ${exportish};\n`;
      assert.ok(mentions(run(checkUntouched, { surface }), exportish), exportish);
    }
  });

  it('refuses a gesture engine import', () => {
    const gestures = `${file('gestures')}\nimport x from 'hammerjs';\n`;
    assert.ok(mentions(run(checkUntouched, { gestures }), 'hammerjs'));
  });
});

describe('the artifacts a frontend checkpoint must not move', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(run(checkImmutability, {}), []);
  });

  it('refuses a changed OpenAPI surface', () => {
    const document = JSON.parse(file('openapi'));
    document.paths['/api/public/invented'] = { get: {} };
    assert.ok(mentions(run(checkImmutability, { openapi: JSON.stringify(document) }), 'paths'));
  });

  it('refuses a moved autosave cadence', () => {
    const model = `${FEATURE}/model/studio-autosave.ts`;
    const moved = (read(REPO_ROOT, model) ?? '').replace(
      'AUTOSAVE_DEBOUNCE_MS = 2500',
      'AUTOSAVE_DEBOUNCE_MS = 800',
    );
    assert.ok(mentions(run(checkImmutability, { [model]: moved }), 'debounce moved'));
  });

  it('refuses a gesture dependency', () => {
    const storefrontPackage = JSON.stringify({
      dependencies: { 'react-zoom-pan-pinch': '^3.0.0' },
    });
    assert.ok(mentions(run(checkImmutability, { storefrontPackage }), 'gesture dependency'));
  });

  it('refuses a checkpoint command added as a root script', () => {
    const rootPackage = JSON.parse(file('rootPackage'));
    rootPackage.scripts['check:app3-s11'] = 'node tools/check-app3-s11.mjs';
    assert.ok(
      mentions(
        run(checkCommandIndex, { rootPackage: JSON.stringify(rootPackage) }),
        'root package',
      ),
    );
  });

  it('refuses an unregistered command', () => {
    const index = file('index').replaceAll('CMD-BENCH-APP3-S11', 'CMD-BENCH-APP3-S11-RENAMED');
    assert.ok(mentions(run(checkCommandIndex, { index }), 'CMD-BENCH-APP3-S11'));
  });
});

describe('the whole gate', () => {
  it('passes against the real repository', () => {
    const failures = [];
    checkApp3S11(REPO_ROOT, (message) => failures.push(message));
    assert.deepEqual(failures, []);
  });
});
