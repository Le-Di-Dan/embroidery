/**
 * Regressions for the `APP3-S05` text-capability gate.
 *
 * Every mutation below leaves a working text editor. That is the selection
 * criterion: a rule that only catches a broken build is a rule the build
 * already had. The dangerous ones are the font list and the NFC rewrite —
 * a hard-coded `['Inter']` is indistinguishable from the registry-derived list
 * until the registry changes, and a `normalize('NFC')` on the write path makes
 * every refusal disappear while silently altering the customer's own text.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { APP3_SURFACE_TOOL_FILES } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkApp3S05,
  checkArchitecture,
  checkControlledFont,
  checkDesignApproval,
  checkGeometryBoundary,
  checkNonScope,
  checkPredecessors,
  checkResponsiveComposition,
  checkSchemaFidelity,
  checkValidation,
  checkVariantReadiness,
  read,
} from './check-app3-s05.mjs';

const FEATURE = 'apps/storefront/src/features/design-studio';
const FONT_ASSETS = 'packages/design-document/assets/fonts/inter/4.1';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((entry) => entry.includes(needle));

/**
 * The phase document as it read before the checkpoint delivered.
 *
 * Both status lines have to be rewound. `APP3-S05-C1` is a separate line, and a
 * rewind that left it recording `COMPLETE` would leave the tree looking like a
 * correction delivered against a checkpoint that never shipped — a world the
 * gate should never have to reason about, and one where every "before delivery"
 * assertion would quietly test nothing.
 */
function rewoundPhase() {
  return file('phase')
    .replace(/\nAPP3-S05 = COMPLETE[^\n]*/, '\nAPP3-S05 = READY — NOT STARTED')
    .replace(/\nAPP3-S05-C1 = COMPLETE[^\n]*/, '\nAPP3-S05-C1 = READY — NOT STARTED');
}

function failuresOf(check, root) {
  const collected = [];
  check(root, (message) => collected.push(message));
  return collected;
}

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s05-'));
  temporaries.push(base);
  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    ...APP3_SURFACE_TOOL_FILES,
    `${FONT_ASSETS}/InterVariable.woff2`,
    `${FONT_ASSETS}/InterVariable-Italic.woff2`,
  ]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // A file the checker tolerates being absent.
    }
  }
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });
  cpSync(
    join(REPO_ROOT, 'packages/database/migrations'),
    join(base, 'packages/database/migrations'),
    {
      recursive: true,
    },
  );
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s05-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

describe('the gate passes the repository it rules on', () => {
  it('reports no failure against the delivered checkpoint', () => {
    assert.deepEqual(checkApp3S05(REPO_ROOT), []);
  });
});

describe('the font picker is the controlled registry and nothing else', () => {
  it('refuses a picker built from a literal list instead of the registry', () => {
    // Identical behaviour today. Wrong the first time the registry changes, and
    // wrong in a way no rendering test could see.
    const root = rootWith({
      fields: file('fields').replace('DESIGN_FONT_REGISTRY.map', 'HARD_CODED_FONTS.map'),
    });
    assert.ok(mentions(failuresOf(checkControlledFont, root), 'not derived from the registry'));
  });

  it('refuses an arbitrary font name anywhere in the feature', () => {
    const root = rootWith({
      copy: `${file('copy')}\nexport const EXTRA_FONT = 'Helvetica';\n`,
    });
    assert.ok(mentions(failuresOf(checkControlledFont, root), 'font literal'));
  });

  it('refuses a remote font source', () => {
    const root = rootWith({
      copy: file('copy').replace(
        'export const STUDIO_TEXT_COPY',
        "const REMOTE = 'https://fonts.googleapis.com/css2';\nexport const STUDIO_TEXT_COPY",
      ),
    });
    assert.ok(mentions(failuresOf(checkControlledFont, root), 'remote font source'));
  });

  it('refuses a second copy of the controlled binary under public/', () => {
    const root = rootWith({
      'apps/storefront/public/fonts/InterVariable.woff2': 'not really a font',
    });
    assert.ok(mentions(failuresOf(checkControlledFont, root), 'a second copy'));
  });

  it('refuses a stylesheet that no longer serves the APP3-F01 asset', () => {
    const root = rootWith({
      styles: file('styles').replaceAll(
        '../../../../../../packages/design-document/assets/fonts/inter/4.1/',
        '/fonts/',
      ),
    });
    const failures = failuresOf(checkControlledFont, root);
    assert.ok(mentions(failures, 'not served from the APP3-F01 asset'));
  });

  it('refuses a font hook that stops reporting the unavailable state', () => {
    const root = rootWith({
      controlledFont: file('controlledFont').replaceAll("'unavailable'", "'ready'"),
    });
    assert.ok(mentions(failuresOf(checkControlledFont, root), 'unavailable state'));
  });

  it('refuses a text capability that never asks the browser', () => {
    // `replaceAll`, not `replace`: both modules name `document.fonts.load` in
    // their own doc blocks, so replacing the first occurrence would only edit
    // the prose the checker already strips. Both files, because `APP3-S05-C1`
    // moved the call — a mutation that left either one intact would prove
    // nothing about the rule.
    const root = rootWith({
      controlledFont: file('controlledFont').replaceAll('document.fonts', 'globalThis.__fonts'),
      variant: file('variant').replaceAll('document.fonts', 'globalThis.__fonts'),
    });
    assert.ok(mentions(failuresOf(checkControlledFont, root), 'never asks the browser'));
  });
});

describe('only P01 fields are editable, and every bound is read', () => {
  it('refuses a field the v1 schema cannot persist', () => {
    const root = rootWith({
      fields: file('fields').replace("'textAlign',", "'textAlign',\n  'letterSpacing',"),
    });
    assert.ok(mentions(failuresOf(checkSchemaFidelity, root), 'cannot persist'));
  });

  it('refuses a thread-colour semantic the schema never defined', () => {
    const root = rootWith({
      copy: `${file('copy')}\nexport const THREAD = 'threadColor';\n`,
    });
    assert.ok(mentions(failuresOf(checkSchemaFidelity, root), 'threadColor'));
  });

  it('refuses a P01 text limit restated as a literal', () => {
    const root = rootWith({
      copy: file('copy').replace(
        'String(DESIGN_DOCUMENT_LIMITS.maxCharactersPerTextElement)',
        'String(500)',
      ),
    });
    assert.ok(mentions(failuresOf(checkSchemaFidelity, root), 'restated as the literal 500'));
  });

  it('refuses counting UTF-16 units instead of code points', () => {
    // `text.length` charges an astral character two of the customer's 500.
    const root = rootWith({
      fields: file('fields').replace('[...text].length', 'text.length'),
    });
    assert.ok(mentions(failuresOf(checkSchemaFidelity, root), 'not counted as code points'));
  });
});

describe('validation is P01s, and never rewrites the customers text', () => {
  it('refuses an NFC rewrite on the write path', () => {
    const root = rootWith({
      controller: file('controller').replace(
        "rule({ text: value }, 'text-edit')",
        "rule({ text: value.normalize('NFC') }, 'text-edit')",
      ),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'normalized on the write path'));
  });

  it('refuses a truncation that repairs an over-long candidate', () => {
    const root = rootWith({
      controller: file('controller').replace(
        "rule({ text: value }, 'text-edit')",
        "rule({ text: value.slice(0, 500) }, 'text-edit')",
      ),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'repaired instead of refused'));
  });

  it('refuses a candidate committed without the complexity limits', () => {
    // A transform could never breach a character count; a text edit is the
    // first thing that can, so dropping this check is silently permissive.
    const root = rootWith({
      authority: file('authority').replaceAll('validateDesignDocumentComplexity', 'skipComplexity'),
    });
    assert.ok(
      mentions(failuresOf(checkValidation, root), 'without validateDesignDocumentComplexity'),
    );
  });

  it('refuses a candidate committed without the controlled-font check', () => {
    const root = rootWith({
      authority: file('authority').replaceAll('supportsVariant', 'anyVariant'),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'without supportsVariant'));
  });

  it('refuses complexity measured before the document is validated', () => {
    const authority = file('authority');
    const reordered = `${authority}\nvalidateDesignDocumentComplexity(0);\nvalidateDesignDocumentStructure(candidate);\n`;
    const root = rootWith({
      authority: reordered.replace(
        'const structure = validateDesignDocumentStructure(candidate);',
        'const structure = alreadyValidated;',
      ),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'before the document is validated'));
  });
});

describe('geometry stays APP3-P02s', () => {
  it('refuses a glyph measurement used anywhere in the feature', () => {
    const root = rootWith({
      controls: file('controls').replace(
        'const ids = useId();',
        'const ids = useId();\n  const width = canvas.measureText(value).width;',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryBoundary, root), 'measurement engine'));
  });

  it('refuses a text edit that writes geometry', () => {
    // An auto-resize from glyph metrics is the plausible version of this, and
    // it would be a second answer to where the element is.
    const root = rootWith({
      fields: file('fields').replace(
        '? { ...element, ...patch }',
        '? { ...element, ...patch, transform: { ...element.transform } }',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryBoundary, root), 'writes geometry'));
  });
});

describe('the architecture S05 inherited is the one it leaves', () => {
  it('refuses a second SVG scene', () => {
    const root = rootWith({
      inspector: file('inspector').replace(
        '<section className="studio-text"',
        '<svg /><section className="studio-text"',
      ),
    });
    assert.ok(mentions(failuresOf(checkArchitecture, root), 'exactly one <svg>'));
  });

  it('refuses a de-memoized element component', () => {
    const root = rootWith({
      stageElement: file('stageElement').replace(
        'export const StudioStageElement = memo(function',
        'export const StudioStageElement = (function',
      ),
    });
    assert.ok(mentions(failuresOf(checkArchitecture, root), 'no longer memoized'));
  });

  it('refuses an adapter that stops reusing the previous scene', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'buildRenderableScene(stageDocument, sceneMemo.current)',
        'buildRenderableScene(stageDocument)',
      ),
    });
    assert.ok(mentions(failuresOf(checkArchitecture, root), 'no longer offered back'));
  });

  it('refuses a browser-persisted text draft', () => {
    const root = rootWith({
      controller: file('controller').replace(
        'setDraft(value);',
        "setDraft(value);\n      localStorage.setItem('studio-text-draft', value);",
      ),
    });
    assert.ok(mentions(failuresOf(checkArchitecture, root), 'persists a draft'));
  });

  it('refuses a controller that commits without ruling on the candidate', () => {
    const root = rootWith({
      controller: file('controller').replaceAll('ruleOnTextCandidate', 'commitDirectly'),
    });
    assert.ok(mentions(failuresOf(checkArchitecture, root), 'without ruling on it'));
  });

  it('refuses a controller that is not composition-aware', () => {
    const root = rootWith({
      controller: file('controller').replaceAll('composing', 'typing'),
    });
    assert.ok(mentions(failuresOf(checkArchitecture, root), 'not composition-aware'));
  });
});

describe('nothing a later checkpoint owns arrives early', () => {
  it('refuses an autosave call', () => {
    const root = rootWith({
      // The commit carries `APP3-S08`'s action now, so the mutation anchors on
      // the opening of the call rather than on the shape S05 shipped with.
      controller: file('controller').replace(
        'commit(outcome.document, {',
        'void publicDesignSessionAutosave();\n      commit(outcome.document, {',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S10 autosave'));
  });

  it('refuses an undo stack', () => {
    const root = rootWith({
      controller: `${file('controller')}\nconst undoStack = [];\n`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S08 history'));
  });

  it('refuses a layer reorder', () => {
    const root = rootWith({
      inspector: `${file('inspector')}\nexport function reorderElement() {}\n`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S04 layers'));
  });

  it('refuses a premature APP3-S11 text bottom sheet', () => {
    const root = rootWith({
      inspector: file('inspector').replace(
        'className="studio-text"',
        'className="studio-text bottomSheet"',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S11 touch'));
  });

  it('refuses the text inspector building a watermark', () => {
    // The word became legitimate at `APP3-S09`; **building** the mark in the
    // text capability's own files did not.
    const root = rootWith({
      copy: `${file('copy')}\nexport const rogue = 'studio-watermark__mark';\n`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'builds a watermark outside'));
  });
});

describe('the design approval is scoped, in both directions', () => {
  it('refuses a blanket approval of a row whose checkpoint has not opened', () => {
    const registry = file('registry');
    const line = registry
      .split('\n')
      .find((row) => row.startsWith('| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED |'));
    const root = rootWith({
      registry: registry.replace(
        line,
        line.replace('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION'),
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'has not opened'));
  });

  it('refuses an S05 row that carries the wrong node', () => {
    const root = rootWith({ registry: file('registry').replace('| 608:176 |', '| 608:999 |') });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'does not carry node 608:176'));
  });

  it('refuses an S05 row approved without S05 evidence', () => {
    const root = rootWith({
      registry: file('registry').replaceAll('APP3-S05 §4 operator review', '—'),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'records no APP3-S05 approval'));
  });
});

describe('the pre-S05 world still bites', () => {
  it('requires the three rows to be unapproved before the checkpoint delivers', () => {
    // Rewind the phase document: the rows are approved, but nothing has
    // delivered, which is the "approved early" failure the gate exists for.
    const root = rootWith({
      phase: rewoundPhase(),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'expected REVIEW_REQUIRED'));
  });

  it('requires every predecessor to be accepted', () => {
    const root = rootWith({
      phase: file('phase').replace(
        'APP3-S03-C1 = COMPLETE — REVIEW_ACCEPTED',
        'APP3-S03-C1 = COMPLETE — REVIEW_DELIVERED',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'APP3-S03-C1'));
  });

  it('requires the audited rulings a reader cannot recompute from source', () => {
    const root = rootWith({
      phase: file('phase').replace(
        'APP3-S05 SCOPE = EDIT_ONLY_NO_CREATION',
        'APP3-S05 SCOPE = TBD',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'EDIT_ONLY_NO_CREATION'));
  });

  it('refuses a later checkpoint recorded complete', () => {
    const root = rootWith({
      phase: `${file('phase')}\nAPP3-S06 = COMPLETE — REVIEW_DELIVERED\n`,
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'S05 does not implement it'));
  });
});

/*
 * The `APP3-S05-C1` correction.
 *
 * Both findings human review returned are failures that leave a *working*
 * editor, which is the selection criterion this file has used throughout. A
 * family-only probe is the sharper of the two: it answers `ready` truthfully
 * about a question nobody asked, and the design is then shown — and later
 * stitched — in a synthesised face. The composition mutations are the same
 * shape: an in-flow drawer edits perfectly and silently re-lays-out the stage,
 * and a CSS-hidden phone inspector is an `APP3-S11` surface that merely looks
 * absent.
 */
describe('controlled-font readiness is asked per exact variant', () => {
  it('refuses a probe that names only the family', () => {
    const root = rootWith({
      variant: file('variant').replace('${variant.fontStyle} ${String(variant.fontWeight)} ', ''),
    });
    const failures = failuresOf(checkVariantReadiness, root);
    assert.ok(mentions(failures, 'does not carry ${variant.fontStyle}'));
    assert.ok(mentions(failures, 'does not carry variant.fontWeight'));
  });

  it('refuses a probe that drops the requested style', () => {
    const root = rootWith({
      variant: file('variant').replaceAll('variant.fontStyle', "'normal'"),
    });
    assert.ok(
      mentions(failuresOf(checkVariantReadiness, root), 'does not carry ${variant.fontStyle}'),
    );
  });

  it('refuses a probe that drops the requested weight', () => {
    const root = rootWith({
      variant: file('variant').replaceAll('variant.fontWeight', '400'),
    });
    assert.ok(
      mentions(failuresOf(checkVariantReadiness, root), 'does not carry variant.fontWeight'),
    );
  });

  it('refuses a fallback family in the probe, which would make every request succeed', () => {
    const root = rootWith({
      variant: file('variant').replace('px "${font.family}"`', 'px "${font.family}", sans-serif`'),
    });
    assert.ok(mentions(failuresOf(checkVariantReadiness, root), 'names a fallback family'));
  });

  it('refuses readiness that does not follow the requested style and weight', () => {
    const root = rootWith({
      controlledFont: file('controlledFont').replace(
        '}, [fontId, fontStyle, fontWeight]);',
        '}, [fontId]);',
      ),
    });
    assert.ok(
      mentions(failuresOf(checkVariantReadiness, root), 'does not depend on the exact variant'),
    );
  });

  it('refuses a failed variant that is committed anyway', () => {
    // The mutation a screenshot cannot see: the italic never loaded, the
    // document says italic, and the browser paints a synthesised slant.
    const root = rootWith({
      controller: file('controller').replace(
        "        if (!available) {\n          setRefusal('controlled-font-unavailable');\n          return;\n        }\n",
        '',
      ),
    });
    assert.ok(mentions(failuresOf(checkVariantReadiness, root), 'does not block the commit'));
  });

  it('refuses a stale variant result that is not discarded', () => {
    const root = rootWith({
      controller: file('controller').replace('if (started !== request.current) return;', ''),
    });
    assert.ok(mentions(failuresOf(checkVariantReadiness, root), 'stale variant result'));
  });
});

describe('the inspector is placed by tier, and the phone gets no editing surface', () => {
  it('refuses an editing surface rendered at the mobile tier', () => {
    const root = rootWith({
      panel: file('panel').replace(
        'if (textElementOf(props.document, props.elementId) === undefined) return null;',
        'return <StudioTextInspector {...props} />;',
      ),
    });
    assert.ok(
      mentions(
        failuresOf(checkResponsiveComposition, root),
        'editing surface is rendered at the mobile tier',
      ),
    );
  });

  it('refuses an inspector mounted past the tier authority', () => {
    // The regression that restores one composition on every viewport, and the
    // exact shape `APP3-S05` shipped with.
    const root = rootWith({
      // The mount lives in the composition file since `APP3-S08`; a mutation
      // still aimed at the screen would replace nothing and prove nothing.
      stagePanels: file('stagePanels').replace('<StudioTextPanel', '<StudioTextInspector'),
    });
    assert.ok(
      mentions(failuresOf(checkResponsiveComposition, root), 'mounted past the tier authority'),
    );
  });

  it('refuses the trigger moved back into the below-stage control strip', () => {
    // The `APP3-S05-C1` shape, which human review rejected: a persistent control
    // outside the drawer, in the strip `APP3-S07` put below the stage. It works.
    // It is not the approved composition, and no behavioural test can say so.
    const root = rootWith({
      drawer: file('drawer').replace('studio-stage__topbar', 'studio-stage__drawer-bar'),
    });
    assert.ok(mentions(failuresOf(checkResponsiveComposition, root), 'not in the Studio topbar'));
  });

  it('refuses a topbar mounted below the stage', () => {
    // The other half: the class is right, the placement is not. Reordering the
    // mount is exactly how a topbar quietly becomes a second bottom strip.
    // The screen names the region it mounts; renaming that marker is the same
    // regression in the world `APP3-S08` left behind — a topbar the frame no
    // longer places above the stage.
    const root = rootWith({
      stageScreen: file('stageScreen').replace('region="topbar"', 'region="body-early"'),
    });
    assert.ok(
      mentions(failuresOf(checkResponsiveComposition, root), 'not mounted above the stage'),
    );
  });

  it('refuses the text trigger added to the APP3-S07 control strip', () => {
    const root = rootWith({
      stageControls: `${file('stageControls')}\nconst LEAK = 'studio-text-drawer-trigger';\n`,
    });
    assert.ok(mentions(failuresOf(checkResponsiveComposition, root), 'in the below-stage strip'));
  });

  it('refuses a drawer trigger that publishes no relationship to its panel', () => {
    const root = rootWith({
      drawer: file('drawer').replace('aria-controls={panelId}', ''),
    });
    assert.ok(mentions(failuresOf(checkResponsiveComposition, root), 'publishes no aria-controls'));
  });

  it('refuses a drawer that does not return focus when it closes', () => {
    const root = rootWith({
      drawer: file('drawer').replace('trigger.current?.focus();', ''),
    });
    assert.ok(mentions(failuresOf(checkResponsiveComposition, root), 'does not return focus'));
  });

  it('refuses a tablet drawer put back into flow', () => {
    // It still edits. It also resizes the stage on every toggle, and every
    // millimetre the overlay derives from the SVG moves with it.
    const root = rootWith({
      styles: file('styles').replace('  position: absolute;\n  // Anchored', '  // Anchored'),
    });
    assert.ok(
      mentions(failuresOf(checkResponsiveComposition, root), 'in flow and pushes the stage'),
    );
  });

  it('refuses a tier measured during render, which flushes layout on every gesture frame', () => {
    // The composition it produces is entirely correct. It also asks the engine
    // for a geometric fact once per frame of a transform, and WebKit resize p95
    // measured 28 ms against the 20 ms budget because of it.
    const root = rootWith({
      tier: file('tier').replace(
        'observed ??= studioTierFor(window.innerWidth);',
        'return studioTierFor(window.innerWidth);',
      ),
    });
    assert.ok(mentions(failuresOf(checkResponsiveComposition, root), 'measured during render'));
  });

  it('refuses a stylesheet breakpoint moved away from the one the renderer uses', () => {
    const root = rootWith({
      styles: file('styles').replace('$bp-studio-split: 1025px', '$bp-studio-split: 900px'),
    });
    assert.ok(mentions(failuresOf(checkResponsiveComposition, root), 'disagree'));
  });

  it('refuses a panel that stops deciding a composition at all', () => {
    const root = rootWith({
      panel: file('panel').replaceAll("tier === 'tablet'", 'false'),
    });
    assert.ok(
      mentions(
        failuresOf(checkResponsiveComposition, root),
        'does not decide the tablet composition',
      ),
    );
  });
});

describe('the correction is recorded, and its rules wait for it', () => {
  it('requires the status block to record what a reader cannot recompute', () => {
    for (const line of [
      'APP3-S05-C1 TABLET_1024 = RIGHT_DRAWER_OVER_THE_STAGE',
      'APP3-S05-C1 MOBILE_390 = NO_S05_TEXT_SURFACE_APP3-S11_OWNS_IT',
      'APP3-S05-C1 FONT_READINESS = EXACT_FONTID_FONTSTYLE_FONTWEIGHT',
    ]) {
      const root = rootWith({
        phase: file('phase').replace(`\n${line}`, '\nAPP3-S05-C1 NOTE = x'),
      });
      assert.ok(mentions(failuresOf(checkPredecessors, root), line));
    }
  });

  it('does not run the correction rules against a tree that predates it', () => {
    // The rules read files `APP3-S05` did not have. Running them on the
    // delivered and sent-back tree would fail it for not yet containing the
    // answer it was being asked for.
    const root = rootWith({ phase: rewoundPhase() });
    const failures = checkApp3S05(root);
    assert.ok(!mentions(failures, 'the readiness probe'));
    assert.ok(!mentions(failures, 'the tier placement authority is missing'));
  });
});
