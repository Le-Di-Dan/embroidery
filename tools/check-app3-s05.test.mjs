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
  checkSchemaFidelity,
  checkValidation,
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

  it('refuses a font hook that never asks the browser', () => {
    const root = rootWith({
      // `replaceAll`, not `replace`: the module's own doc block names
      // `document.fonts.load`, so replacing the first occurrence would only
      // edit the prose the checker already strips.
      controlledFont: file('controlledFont').replaceAll('document.fonts', 'globalThis.__fonts'),
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
        'rule({ text: value })',
        "rule({ text: value.normalize('NFC') })",
      ),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'normalized on the write path'));
  });

  it('refuses a truncation that repairs an over-long candidate', () => {
    const root = rootWith({
      controller: file('controller').replace(
        'rule({ text: value })',
        'rule({ text: value.slice(0, 500) })',
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
      controller: file('controller').replace(
        'commit(outcome.document);',
        'commit(outcome.document);\n      void publicDesignSessionAutosave();',
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

  it('refuses a watermark', () => {
    const root = rootWith({
      copy: `${file('copy')}\nexport const watermark = true;\n`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S09 watermark'));
  });
});

describe('the design approval is scoped, in both directions', () => {
  it('refuses a blanket approval of a row whose checkpoint has not opened', () => {
    const registry = file('registry');
    const line = registry
      .split('\n')
      .find((row) => row.startsWith('| FIG-STUDIO-LAYERS-DESKTOP-DEFAULT |'));
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
      phase: file('phase').replace(
        'APP3-S05 = COMPLETE — REVIEW_DELIVERED',
        'APP3-S05 = READY — NOT STARTED',
      ),
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
