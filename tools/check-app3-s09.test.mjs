/**
 * Regressions for the `APP3-S09` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **visible watermark** behind:
 *
 * - the mark moved inside the transformed layer, which looks identical at fit
 *   and is gone from the visible preview at 400 % with a pan;
 * - a watermark element type added to `APP3-P01`, which is a mark the customer
 *   can select and delete and the server will store;
 * - the token minted from `Math.random()`, or in a `useMemo` React may discard,
 *   or derived from the Session — each of which draws a perfectly good-looking
 *   mark that is guessable, unstable or carrying real identity;
 * - one contrast treatment instead of two, which is invisible over half the
 *   photographs a customer can upload;
 * - `pointer-events` removed, which makes every element underneath unclickable;
 * - a PrintScreen trap or a `download` control, which is the theatre the policy
 *   note would then have to lie about.
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
  checkAccessibility,
  checkApp3S09,
  checkCommandIndex,
  checkContrast,
  checkDesignApproval,
  checkImmutability,
  checkNoExport,
  checkNotSerialized,
  checkPattern,
  checkPredecessors,
  checkToken,
  checkViewportAnchored,
} from './check-app3-s09.mjs';
import { CANONICAL_FILES, FEATURE, REPO_ROOT, read } from './check-app3-s09.sources.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s09-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s09.mjs',
    'tools/check-app3-s09-runtime.mjs',
    'tools/check-app3-s09.sources.mjs',
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
  const root = mkdtempSync(join(tmpdir(), 'app3-s09-case-'));
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
      'APP3-S02 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-S07 = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects an unaccepted APP3-S04', () => {
    const phase = file('phase').replace(
      'APP3-S04 = COMPLETE — REVIEW_ACCEPTED — GROUP_DEFERRED_BY_AUTHORITY',
      'APP3-S04 = COMPLETE — REVIEW_DELIVERED — GROUP_BLOCKED',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-S04 is not recorded as accepted'));
  });

  /*
   * The rulings a reader cannot recompute from the source.
   *
   * Two spans in a component look like a style choice; only the status says the
   * second treatment exists because sampling the customer's photograph was
   * refused. Dropping the line is how that reasoning gets lost.
   */
  it('rejects a status that drops a ruling', () => {
    for (const line of [
      'APP3-S09 DOCUMENT = NOT_SERIALIZED',
      'APP3-S09 LAYER = VIEWPORT_SIBLING_OF_THE_S07_TRANSFORM',
      'APP3-S09 TOKEN = CRYPTO_RANDOM_ONCE_PER_RUNTIME',
      'APP3-S09 CONTRAST = BOTH_APPROVED_TREATMENTS_DRAWN',
      'APP3-S09 POLICY = TWO_FACTS_NO_PROMISE',
    ]) {
      const phase = file('phase').replace(`\n${line}`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  /*
   * `APP3-S08` left this list when human review accepted it: the rule is
   * world-aware on it now, exactly as it already was on `APP3-S09`. The two
   * capabilities that genuinely have not opened are still asserted, so a blanket
   * "the Studio is done" still fails here.
   */
  it('refuses a later Studio capability recorded complete', () => {
    for (const later of ['APP3-E01']) {
      const phase = `${file('phase')}\n${later} = COMPLETE — REVIEW_DELIVERED\n`;
      assert.ok(mentions(run(checkPredecessors, { phase }), later), later);
    }
  });
});

describe('design approval stays scoped', () => {
  it('accepts the four approved rows', () => {
    assert.deepEqual(run(checkDesignApproval), []);
  });

  it('refuses an unapproved S09 row', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-WATERMARK-DESKTOP-DARK \|[^\n]*?)APPROVED_FOR_IMPLEMENTATION/,
      '$1REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'not approved'));
  });

  it('refuses a row that resolves to a different node', () => {
    const registry = file('registry').replaceAll('| 609:299 |', '| 609:300 |');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'does not resolve to node'));
  });

  it('refuses a blanket Studio approval', () => {
    const registry = file('registry').replaceAll('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'belongs to a later checkpoint'));
  });

  it('refuses re-attributing the 1024 reference to this checkpoint', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*)APP3-D01-C1/,
      '$1APP3-S09',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 're-attributed'));
  });
});

describe('the watermark is not in the document', () => {
  it('accepts the delivered feature', () => {
    assert.deepEqual(run(checkNotSerialized), []);
  });

  it('refuses a watermark element type added to APP3-P01', () => {
    const elements = replacing(
      'elements',
      "export type DesignElementType = 'text' | 'image' | 'shape' | 'freehand' | 'group';",
      "export type DesignElementType = 'text' | 'image' | 'shape' | 'freehand' | 'group' | 'watermark';",
    );
    assert.ok(mentions(run(checkNotSerialized, { elements }), 'union'));
  });

  it('refuses a watermark field on the document', () => {
    const document = `${file('document')}\nexport interface Watermark { readonly watermarkToken: string }\n`;
    assert.ok(mentions(run(checkNotSerialized, { document }), 'watermark field'));
  });

  it('refuses the mark reaching the document', () => {
    const watermark = `${file('watermark')}\nexport const write = (commit: (d: unknown) => void) => { commit({ elements: [] }); };\n`;
    assert.ok(mentions(run(checkNotSerialized, { watermark }), 'reaches the document'));
  });

  it('refuses the token parked in a store', () => {
    const hook = `${file('hook')}\nimport { create } from 'zustand';\nvoid create;\n`;
    assert.ok(mentions(run(checkNotSerialized, { hook }), 'editor or document state'));
  });
});

describe('the overlay is anchored to the viewport', () => {
  it('accepts the delivered anchoring', () => {
    assert.deepEqual(run(checkViewportAnchored), []);
  });

  it('refuses the mark moved inside the transformed layer', () => {
    // The mutation that looks perfect at fit and is gone at 400 % with a pan.
    //
    // Retargeted at `APP3-S11`: the element gained a second prop and Prettier
    // broke it across lines, so the old single-line anchor would `.replace`
    // nothing and this case would pass against an unmodified file.
    const screen = replacing(
      'screen',
      'overlay={<StudioStageWatermark token={watermarkToken} />}',
      '',
    );
    assert.ok(mentions(run(checkViewportAnchored, { screen }), 'overlay slot'));
  });

  it('refuses an overlay rendered inside the layer', () => {
    // The same JSX, moved one level in: it renders, it looks right at fit, and
    // the zoom transform now carries it off the visible preview.
    const source = file('viewport');
    const inside = source
      .replace('\n      {overlay}\n', '\n')
      .replace(
        '        {children}\n      </div>',
        '        {children}\n        {overlay}\n      </div>',
      );
    assert.ok(!inside.includes('\n      {overlay}\n'), 'the outer slot survived the mutation');

    assert.ok(mentions(run(checkViewportAnchored, { viewport: inside }), 'sibling'));
  });

  it('refuses a watermark that does not cover its box', () => {
    const styles = replacing(
      'styles',
      '.studio-watermark {\n  position: absolute;\n  inset: 0;',
      '.studio-watermark {\n  position: static;',
    );
    assert.ok(mentions(run(checkViewportAnchored, { styles }), 'does not cover the viewport'));
  });

  it('refuses a watermark that scales with the zoom', () => {
    const watermark = `${file('watermark')}\nexport const scaled = (zoomStep: number) => zoomStep;\n`;
    assert.ok(mentions(run(checkViewportAnchored, { watermark }), 'scales or moves'));
  });
});

describe('the token', () => {
  it('accepts the delivered token', () => {
    assert.deepEqual(run(checkToken), []);
  });

  it('refuses Math.random', () => {
    const model = replacing(
      'model',
      'random.getRandomValues(new Uint8Array(TOKEN_LENGTH))',
      'new Uint8Array(TOKEN_LENGTH).map(() => Math.random() * 255)',
    );
    assert.ok(mentions(run(checkToken, { model }), 'Math.random'));
  });

  it('refuses a token minted through a recomputable memo', () => {
    const hook = replacing(
      'hook',
      'const [token] = useState(mintWatermarkToken);',
      'const token = useMemo(mintWatermarkToken, []);',
    );
    assert.ok(mentions(run(checkToken, { hook }), 'recomputable memo'));
  });

  it('refuses a mint that can be handed an identity', () => {
    const model = replacing(
      'model',
      'export function mintWatermarkToken(): string {',
      'export function mintWatermarkToken(sessionId: string): string {\n  void sessionId;',
    );
    assert.ok(mentions(run(checkToken, { model }), 'accepts an input'));
  });

  it('refuses a token derived from identity', () => {
    for (const [needle, added] of [
      ['cookie', 'const from = document.cookie;\nvoid from;'],
      ['assetId', 'const from: string = String(0);\nconst assetId = from;\nvoid assetId;'],
    ]) {
      const model = `${file('model')}\n${added}\n`;
      assert.ok(mentions(run(checkToken, { model }), needle), needle);
    }
  });

  it('refuses a token that is persisted, logged or sent', () => {
    for (const [needle, added] of [
      ['localStorage', "localStorage.setItem('t', '1');"],
      ['console.', "console.info('token');"],
    ]) {
      const hook = `${file('hook')}\n${added}\n`;
      assert.ok(mentions(run(checkToken, { hook }), needle), needle);
    }
  });
});

describe('the pattern', () => {
  it('accepts the delivered pattern', () => {
    assert.deepEqual(run(checkPattern), []);
  });

  it('refuses a tile count that depends on the page', () => {
    const model = replacing(
      'model',
      'export function watermarkTiles(): readonly WatermarkTile[] {',
      'export function watermarkTiles(elementCount: number): readonly WatermarkTile[] {\n  void elementCount;',
    );
    assert.ok(mentions(run(checkPattern, { model }), 'depends on an input'));
  });

  it('refuses an axis-aligned band that a crop can follow', () => {
    const model = replacing('model', 'WATERMARK_ANGLE_DEG = -30', 'WATERMARK_ANGLE_DEG = 0');
    assert.ok(mentions(run(checkPattern, { model }), 'croppable'));
  });
});

describe('contrast', () => {
  it('accepts both delivered treatments', () => {
    assert.deepEqual(run(checkContrast), []);
  });

  it('refuses a single treatment', () => {
    const watermark = without('watermark', 'studio-watermark__text--dark');
    assert.ok(mentions(run(checkContrast, { watermark }), 'only one contrast treatment'));
  });

  it('refuses a colour literal', () => {
    const styles = replacing(
      'styles',
      '.studio-watermark__text--dark {\n  color: styles.$color-surface-primary;',
      '.studio-watermark__text--dark {\n  color: #ffffff;',
    );
    assert.ok(mentions(run(checkContrast, { styles }), 'colour literal'));
  });

  it('refuses sampling the customer pixels', () => {
    const watermark = `${file('watermark')}\nexport const sample = (c: HTMLCanvasElement) => c.getContext('2d')?.getImageData(0, 0, 1, 1);\n`;
    assert.ok(mentions(run(checkContrast, { watermark }), 'samples customer pixels'));
  });
});

describe('accessibility', () => {
  it('accepts the delivered overlay', () => {
    assert.deepEqual(run(checkAccessibility), []);
  });

  it('refuses a pattern announced to assistive technology', () => {
    const watermark = without('watermark', 'aria-hidden="true"');
    assert.ok(mentions(run(checkAccessibility, { watermark }), 'announced'));
  });

  it('refuses a watermark that takes the pointer', () => {
    const styles = replacing(
      'styles',
      '  pointer-events: none;\n  user-select: none;',
      '  user-select: none;',
    );
    assert.ok(mentions(run(checkAccessibility, { styles }), 'takes a pointer'));
  });

  it('refuses an interactive watermark', () => {
    const watermark = replacing(
      'watermark',
      '<span className="studio-watermark__mark"',
      '<button className="studio-watermark__mark"',
    );
    assert.ok(mentions(run(checkAccessibility, { watermark }), 'interactive'));
  });

  it('refuses dropping the policy text', () => {
    const watermark = without('watermark', 'StudioWatermarkNotice');
    assert.ok(mentions(run(checkAccessibility, { watermark }), 'real text'));
  });
});

describe('no export and no theatre', () => {
  it('accepts the delivered feature', () => {
    assert.deepEqual(run(checkNoExport), []);
  });

  it('refuses a download or export control', () => {
    const watermark = `${file('watermark')}\nexport const save = (a: HTMLAnchorElement) => { a.download = 'x'; };\n`;
    assert.ok(mentions(run(checkNoExport, { watermark }), 'export or download'));
  });

  it('refuses a screenshot-prevention hack', () => {
    for (const [needle, added] of [
      ['PrintScreen', "export const trap = (k: string) => k === 'PrintScreen';"],
      ['onContextMenu', 'export const block = { onContextMenu: () => undefined };'],
    ]) {
      const watermark = `${file('watermark')}\n${added}\n`;
      assert.ok(mentions(run(checkNoExport, { watermark }), needle), needle);
    }
  });

  it('refuses a policy note that claims screenshots are prevented', () => {
    const copy = replacing(
      'copy',
      "policy: 'Bản xem trước có đóng dấu.",
      "policy: 'Chúng tôi chặn chụp màn hình. Bản xem trước có đóng dấu.",
    );
    assert.ok(mentions(run(checkNoExport, { copy }), 'claims screenshots'));
  });

  /*
   * The published-strings rule, proved to be a rule about strings.
   *
   * The docblock above the copy explains *why* a screenshot claim is forbidden
   * and therefore contains the words. A file-wide ban fired on it — on this
   * gate's own first run — so this pins that the honest prose still passes.
   */
  it('leaves the docblock that explains the ban alone', () => {
    assert.ok(!mentions(run(checkNoExport), 'claims screenshots'));
  });

  it('refuses a second renderer', () => {
    const watermark = `${file('watermark')}\nexport const second = <canvas />;\n`;
    assert.ok(mentions(run(checkNoExport, { watermark }), 'canvas'));
  });

  it('refuses a watermark built outside the four owned files', () => {
    const screen = `${file('screen')}\nconst rogue = 'studio-watermark__rogue';\nvoid rogue;\n`;
    assert.ok(mentions(run(checkNoExport, { screen }), 'outside the four files'));
  });
});

describe('the artifacts and the command index', () => {
  it('accepts the registered commands', () => {
    assert.deepEqual(run(checkCommandIndex), []);
  });

  it('refuses an unregistered command', () => {
    for (const id of ['CMD-CHECK-APP3-S09', 'CMD-TEST-APP3-S09-STOREFRONT']) {
      const index = file('index').replaceAll(id, 'CMD-REMOVED');
      assert.ok(mentions(run(checkCommandIndex, { index }), id), id);
    }
  });

  it('refuses a new dependency', () => {
    const manifest = file('manifest').replace(
      '"dependencies": {',
      '"dependencies": {\n    "html2canvas": "^1.0.0",',
    );
    assert.ok(mentions(run(checkImmutability, { manifest }), 'dependency was added'));
  });
});

describe('the whole gate', () => {
  it('passes against the real repository', () => {
    const failures = [];
    checkApp3S09(REPO_ROOT, (message) => failures.push(message));
    assert.deepEqual(failures, []);
  });
});
