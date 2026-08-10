/**
 * Regressions for the `APP3-S03-C1` render-reuse rules.
 *
 * Split from `check-app3-s03.test.mjs` by responsibility: that file asks "does
 * the transform still write what `IMP-D045` says it writes", and this one asks
 * "did making it fast quietly make it wrong".
 *
 * Every mutation below leaves an editor that works. The dangerous ones are the
 * two at the top — reuse by element id, and the memo comparator — because both
 * produce a stage that is correct in every ungrouped, single-property scene
 * anyone would think to open by hand, and wrong the moment a customer groups
 * something or an element changes in a way the comparator's author forgot.
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
  checkElementMemo,
  checkNoBenchmarkBranch,
  checkRenderReuse,
} from './check-app3-s03.mjs';
import { FEATURE, read } from './check-app3-s03.sources.mjs';

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
  base = mkdtempSync(join(tmpdir(), 'app3-s03-c1-'));
  temporaries.push(base);
  for (const relative of [...Object.values(CANONICAL_FILES), ...APP3_SURFACE_TOOL_FILES]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // A file the checker tolerates being absent.
    }
  }
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s03-c1-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

describe('the reuse rules pass the repository they rule on', () => {
  it('reports no failure against the delivered correction', () => {
    const root = baseRoot();
    assert.deepEqual(failuresOf(checkRenderReuse, root), []);
    assert.deepEqual(failuresOf(checkElementMemo, root), []);
    assert.deepEqual(failuresOf(checkNoBenchmarkBranch, root), []);
  });
});

describe('reuse may never be decided by element id alone', () => {
  it('refuses reuse that never walks the ancestor chain', () => {
    // The whole defect in one edit: a grouped child's own record is unchanged
    // when the group moves, so this repaints it at the group's old position.
    const root = rootWith({
      renderIdentity: file('renderIdentity').replaceAll('graph.parentOf', 'graph.childrenOf'),
    });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'does not consult the ancestor chain'));
  });

  it('refuses reuse that never asks whether an ancestor is itself reusable', () => {
    const root = rootWith({
      renderIdentity: file('renderIdentity').replace(
        'const result = parent === undefined || stable(parent);',
        'const result = true;',
      ),
    });
    assert.ok(
      mentions(failuresOf(checkRenderReuse, root), "ancestor's own reusability is never asked"),
    );
  });

  it('refuses reuse without a value comparison', () => {
    const root = rootWith({
      renderIdentity: file('renderIdentity').replaceAll('jsonEqual', 'sameShape'),
    });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'without comparing their values'));
  });

  it('refuses a missing structural-reuse module', () => {
    const root = rootWith({ renderIdentity: '' });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'structural-reuse module is missing'));
  });
});

describe('the adapter keeps its authority while reusing', () => {
  it('refuses an adapter that stopped validating the payload', () => {
    const root = rootWith({
      scene: file('scene').replace(
        'validateDesignDocumentStructure(payload)',
        'trustedDocument(payload)',
      ),
    });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'no longer validates the payload'));
  });

  it('refuses a placed element reused without the unchanged set', () => {
    const root = rootWith({
      scene: file('scene').replace('unchanged.has(element.id)', 'true'),
    });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'without the unchanged set'));
  });

  it('refuses an adapter that no longer shares identity at all', () => {
    const root = rootWith({
      scene: file('scene').replaceAll('shareDocumentIdentity', 'passThrough'),
    });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'does not use shareDocumentIdentity'));
  });

  it('refuses a screen that stops offering the previous build back', () => {
    // The regression that restores scene-wide churn on a one-element resize:
    // everything still renders correctly, and every element rebuilds.
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'buildRenderableScene(stageDocument, sceneMemo.current)',
        'buildRenderableScene(stageDocument)',
      ),
    });
    assert.ok(mentions(failuresOf(checkRenderReuse, root), 'previous build is not offered back'));
  });
});

describe('the element component is memoized on identity', () => {
  it('refuses an unmemoized element component', () => {
    // The other half of the same regression: identity is preserved and every
    // element re-renders anyway.
    const root = rootWith({
      stageElement: file('stageElement')
        .replace(
          'export const StudioStageElement = memo(function StudioStageElement({',
          'export function StudioStageElement({',
        )
        .replace('});\n\nfunction ElementShape', '}\n\nfunction ElementShape'),
    });
    assert.ok(mentions(failuresOf(checkElementMemo, root), 'is not memoized'));
  });

  it('refuses a hand-written comparator', () => {
    const root = rootWith({
      stageElement: file('stageElement').replace(
        '});\n\nfunction ElementShape',
        '}, propsAreEqual);\n\nfunction ElementShape',
      ),
    });
    assert.ok(mentions(failuresOf(checkElementMemo, root), 'hand-written comparator'));
  });
});

describe('no branch exists only to move a benchmark number', () => {
  for (const [label, injected] of [
    ['a user-agent test', 'const slow = navigator.userAgent.includes("WebKit");'],
    ['a scene-size threshold', 'const heavy = document.elements.length >= 50;'],
    ['a skipped validation', 'const skipValidation = true;'],
  ]) {
    it(`refuses ${label}`, () => {
      const root = rootWith({ scene: `${file('scene')}\n${injected}\n` });
      assert.ok(mentions(failuresOf(checkNoBenchmarkBranch, root), 'benchmark-shaped branch'));
    });
  }
});
