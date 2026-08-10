/**
 * Regressions for the `APP3-S01` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice
 * are the mutations that leave a **working screen**: a second Studio route that
 * renders perfectly well; a blanket Studio design approval that unblocks every
 * later checkpoint at once; the compatibility triple dropped from the query key,
 * so a late response for the previous Side quietly replaces the current one;
 * `placeholderData` restored, so one Template's artwork appears under another
 * Template's name; object-URL revocation removed, so `no-store` bytes outlive
 * the render; a refused clone falling back to a blank session; and a Session id
 * written to `localStorage`.
 *
 * The last block rewinds the phase document to prove the **pre-S01** half still
 * bites: a Studio route that exists before the checkpoint that owns it, and a
 * design row approved before its checkpoint opened.
 */
import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { APP3_SURFACE_TOOL_FILES } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkApiBoundary,
  checkApp3S01,
  checkDesignApproval,
  checkPredecessors,
  checkPreview,
  checkRoute,
  checkSelection,
  checkSession,
  checkTemplateReads,
} from './check-app3-s01.mjs';
import { FEATURE, read } from './check-app3-s01.sources.mjs';

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
  base = mkdtempSync(join(tmpdir(), 'app3-s01-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s01.mjs',
    'tools/check-app3-s01.sources.mjs',
    'tools/check-app3-s01-runtime.mjs',
    ...APP3_SURFACE_TOOL_FILES,
  ]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // A file the checker tolerates being absent.
    }
  }
  // The whole feature, so the whole-feature bans see every file rather than
  // only the ones this harness happened to name.
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s01-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** The phase document with S01 rewound to the world before this checkpoint. */
function beforeS01() {
  return file('phase').replace(
    /\nAPP3-S01 = COMPLETE[^\n]*\n/,
    '\nAPP3-S01 = READY — NOT STARTED\n',
  );
}

describe('entry authority', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(checkApp3S01(REPO_ROOT), []);
  });

  it('refuses an unaccepted predecessor', () => {
    const root = rootWith({
      phase: file('phase').replace(
        '\nAPP3-B05A = COMPLETE — REVIEW_ACCEPTED\n',
        '\nAPP3-B05A = COMPLETE — REVIEW_DELIVERED\n',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'APP3-B05A'));
  });

  it('refuses an S01 recorded under no legitimate status', () => {
    const root = rootWith({
      phase: file('phase').replace(/\nAPP3-S01 = COMPLETE[^\n]*\n/, '\nAPP3-S01 = SHIPPED\n'),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'legitimate status'));
  });

  it('refuses a checkpoint that closed the TEMPLATE_SOURCE follow-up', () => {
    const root = rootWith({
      phase: file('phase').replaceAll('FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01', 'CLOSED'),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'intake follow-up'));
  });

  it('refuses an S02 recorded complete before S01 delivered it', () => {
    // A successor cannot ship on a predecessor that has not. Once S01 *is*
    // delivered the stage is free to exist, so the rewind is what makes this a
    // violation rather than the ordinary world — the rule moved with the world
    // instead of being deleted when the world moved past it.
    const root = rootWith({
      phase: `${beforeS01()}\nAPP3-S02 = COMPLETE — REVIEW_DELIVERED\n`,
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'before APP3-S01 delivered it'));
  });
});

describe('scoped design approval', () => {
  it('refuses an S01 row that stayed unapproved', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-SHELL-DESKTOP-EMPTY \|[^\n]*)APPROVED_FOR_IMPLEMENTATION/,
        '$1REVIEW_REQUIRED',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-SHELL-DESKTOP-EMPTY'));
  });

  it('refuses the zoom row approved before APP3-S07 opened', () => {
    // The narrowing that let `APP3-S07` approve its own rows is conditional on
    // S07 having shipped. Rewind that line and the original ban is back, so the
    // row cannot be approved early by rewriting only the registry.
    const root = rootWith({
      phase: file('phase').replace(
        /\nAPP3-S07 = COMPLETE[^\n]*\n/,
        '\nAPP3-S07 = READY — NOT STARTED\n',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-ZOOM-DESKTOP-FIT'));
  });

  it('refuses an approval that carries no evidence', () => {
    const root = rootWith({
      registry: file('registry').replace('APP3-S01 §3 operator review', '—'),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'approval evidence'));
  });

  it('refuses a blanket Studio approval', () => {
    // The mutation that unblocks every later Studio checkpoint at once, and the
    // reason approval is asserted in both directions. Asserted on a layers row:
    // `APP3-S02` legitimately approved the three section-06 stage rows, so those
    // are no longer evidence of anything — a gate that still named one of them
    // would be catching this mutation for a reason that had stopped being true.
    const root = rootWith({
      registry: file('registry').replaceAll('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION'),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT'));
  });

  it('refuses the S02 stage rows approved before S02 opened', () => {
    // The other half of the same world-awareness: in the world where S02 has
    // not delivered, those three rows are exactly as unapproved as the rest.
    const root = rootWith({
      phase: file('phase').replace(
        /\nAPP3-S02 = COMPLETE[^\n]*\n/,
        '\nAPP3-S02 = READY — NOT STARTED\n',
      ),
    });
    assert.ok(
      mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-STAGE-DESKTOP-UNSELECTED'),
    );
  });

  it('refuses a row whose node id moved', () => {
    const root = rootWith({ registry: file('registry').replaceAll('| 604:5 |', '| 604:9999 |') });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'node 604:5'));
  });
});

describe('the route', () => {
  it('refuses a competing Studio route', () => {
    const root = rootWith({});
    const competing = join(root, 'apps/storefront/src/app/studio/page.tsx');
    mkdirSync(dirname(competing), { recursive: true });
    writeFileSync(competing, 'export default function Studio() { return null; }');
    assert.ok(mentions(failuresOf(checkRoute, root), 'competing Studio route'));
  });

  it('refuses a route that became a client component', () => {
    const root = rootWith({ route: `'use client';\n${file('route')}` });
    assert.ok(mentions(failuresOf(checkRoute, root), 'client component'));
  });

  it('refuses a route that spells the segment itself', () => {
    const root = rootWith({
      route: file('route').replace(
        'buildStorefrontStudioPath(result.product.slug)',
        "`/san-pham/${result.product.slug}/` + 'thiet-ke'",
      ),
    });
    assert.ok(mentions(failuresOf(checkRoute, root), 'route authority'));
  });

  it('refuses a studio nav item that grew an href', () => {
    const root = rootWith({
      navigation: file('navigation').replace(
        "{ id: 'studio', label: 'Studio', route: null }",
        "{ id: 'studio', label: 'Studio', route: '/studio' }",
      ),
    });
    assert.ok(mentions(failuresOf(checkRoute, root), 'non-interactive'));
  });
});

describe('the API boundary', () => {
  it('refuses an Admin placement read', () => {
    const root = rootWith({
      [`${FEATURE}/services/studio-placement.client.ts`]:
        'export const x = adminProductPlacementGet;',
    });
    assert.ok(mentions(failuresOf(checkApiBoundary, root), 'adminProductPlacementGet'));
  });

  it('refuses a hard-coded API path', () => {
    const root = rootWith({
      [`${FEATURE}/services/studio-placement.client.ts`]:
        "export const url = '/api/public/products';",
    });
    assert.ok(mentions(failuresOf(checkApiBoundary, root), 'hard-coded API path'));
  });

  it('refuses a storage address', () => {
    const root = rootWith({
      [`${FEATURE}/model/studio-copy.ts`]: 'export const K = { storageKey: 1 };',
    });
    assert.ok(mentions(failuresOf(checkApiBoundary, root), 'storage address'));
  });

  it('refuses an autosave operation crossing the curated boundary', () => {
    const root = rootWith({
      curatedClient: `${file('curatedClient')}\nexport {\n  publicDesignSessionAutosave,\n} from './generated/embroidery-api';\n`,
    });
    assert.ok(mentions(failuresOf(checkApiBoundary, root), 'without a consumer'));
  });
});

describe('Template reads', () => {
  it('refuses a list that drops one of the three ids', () => {
    const root = rootWith({
      templateService: file('templateService').replace('productSideId: triple.productSideId,', ''),
    });
    assert.ok(mentions(failuresOf(checkTemplateReads, root), 'productSideId'));
  });

  it('refuses a fabricated pagination parameter', () => {
    const root = rootWith({
      templateService: file('templateService').replace(
        'limit: STUDIO_TEMPLATE_PAGE_SIZE,',
        'offset: 0,',
      ),
    });
    assert.ok(mentions(failuresOf(checkTemplateReads, root), 'offset'));
  });

  it('refuses a Template key without the compatibility triple', () => {
    // The mutation that leaves a working picker: without the triple in the key,
    // a response for the previous Side lands in the current Side's cache.
    const root = rootWith({
      queryKeys: file('queryKeys').replaceAll('tripleKey', 'looseKey'),
    });
    assert.ok(mentions(failuresOf(checkTemplateReads, root), 'compatibility triple'));
  });

  it('refuses a preview key without the published version', () => {
    const root = rootWith({
      queryKeys: file('queryKeys').replace(
        'templateAsset: (templateSlug: string, version: number, assetId: string)',
        'templateAsset: (templateSlug: string, assetId: string)',
      ),
    });
    assert.ok(mentions(failuresOf(checkTemplateReads, root), 'published version'));
  });

  it('refuses continuation that ignores hasNext', () => {
    const root = rootWith({
      templateModel: file('templateModel').replace('if (!page.hasNext) return undefined;', ''),
    });
    assert.ok(mentions(failuresOf(checkTemplateReads, root), 'hasNext'));
  });
});

describe('selection', () => {
  it('refuses an order with no stable tie-breaker', () => {
    const root = rootWith({
      placementModel: file('placementModel').replace(
        'return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;',
        'return 0;',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'tie-breaker'));
  });

  it('refuses an Area resolved outside its Side', () => {
    const root = rootWith({
      placementModel: file('placementModel').replace(
        'return side.areas.find((area) => area.id === areaId);',
        'return undefined;',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'inside its own Side'));
  });

  it('refuses a cascade that keeps the old Template', () => {
    const root = rootWith({
      selection: file('selection').replaceAll(
        'templateSlug: null',
        'templateSlug: state.templateSlug',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'clear the Template'));
  });

  it('refuses Template requests on an ineligible Product', () => {
    const root = rootWith({
      screen: file('screen').replace(
        'useTemplateList(eligible ? triple : undefined)',
        'useTemplateList(triple)',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'ineligible Product'));
  });
});

/**
 * The exact refinement human review rejected in `APP3-S01-C1`, put back.
 *
 * A mutation the delivered code actually shipped, not an invented one — which
 * is the only kind that proves the gate would have caught it. Every fixture in
 * which each Side has an Area passes with the refinement in place, so the gate
 * has to rule on the code's shape rather than on a selection outcome.
 */
describe('the canonical first active Side (IMP-D041 PO-04)', () => {
  it('refuses an initial Side chosen from a list narrowed by Area count', () => {
    const root = rootWith({
      placementModel: file('placementModel').replace(
        'return orderedSides(placement)[0];',
        [
          'const sides = orderedSides(placement);',
          '  return sides.find((side) => side.areas.length > 0) ?? sides[0];',
        ].join('\n'),
      ),
    });

    const failures = failuresOf(checkSelection, root);
    assert.ok(mentions(failures, 'canonical first row'));
    assert.ok(mentions(failures, 'narrows the Side list'));
  });

  it('refuses the same skip written as a named helper', () => {
    const root = rootWith({
      placementModel: file('placementModel').replace(
        'return orderedSides(placement)[0];',
        'return firstSideWithArea(orderedSides(placement));',
      ),
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'narrows the Side list'));
  });

  it('refuses the same skip written as a filter anywhere in the feature', () => {
    const root = rootWith({
      [`${FEATURE}/model/studio-usable-sides.ts`]:
        'export const usable = (p) => p.sides.filter((side) => side.areas.length > 0)[0];\n',
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'narrows the Side list'));
  });

  it('refuses a reducer that cannot represent a Side with no Area', () => {
    const root = rootWith({
      selection: file('selection').replace('areaId: area?.id ?? null', 'areaId: area?.id ?? ""'),
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'null Area'));
  });

  it('refuses a reconcile that drops a still-present Side', () => {
    const root = rootWith({
      selection: file('selection').replace(
        'const next = selectionForSide(action.placement, side.id);',
        'const next = selectionForSide(action.placement, null);',
      ),
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'still-present Side is not kept'));
  });

  it('refuses a screen that leaves the downstream chain open with no Area', () => {
    const root = rootWith({
      screen: file('screen').replace('codes === undefined ? (', 'false ? ('),
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'close the downstream chain'));
  });

  it('refuses an Area-less Side reported as a Product-level refusal', () => {
    const root = rootWith({
      screen: file('screen').replace(
        '{codes === undefined ? (',
        '{side === undefined || codes === undefined ? (',
      ),
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'Product-level refusal'));
  });

  it('refuses a screen that never explains why the Side is unusable', () => {
    const root = rootWith({
      // `replaceAll`: the hint constant shares the prefix, and leaving it behind
      // would satisfy the rule with a sentence that explains nothing.
      screen: file('screen').replaceAll('STUDIO_COPY.sideWithoutArea', "''"),
    });

    assert.ok(mentions(failuresOf(checkSelection, root), 'not explained to the customer'));
  });
});

describe('the preview blob', () => {
  it('refuses a preview that never revokes its object URL', () => {
    const root = rootWith({
      previewHook: file('previewHook').replace(/return \(\) => \{[\s\S]*?\};/, 'return;'),
    });
    assert.ok(mentions(failuresOf(checkPreview, root), 'effect cleanup'));
  });

  it('refuses a retained no-store blob', () => {
    const root = rootWith({ previewHook: file('previewHook').replace('gcTime: 0,', '') });
    assert.ok(mentions(failuresOf(checkPreview, root), 'retained'));
  });

  it('refuses placeholderData under the preview key', () => {
    // The mutation that leaves a working preview and shows the wrong artwork.
    const root = rootWith({
      previewHook: file('previewHook').replace('gcTime: 0,', 'gcTime: 0,\n    placeholderData: 1,'),
    });
    assert.ok(mentions(failuresOf(checkPreview, root), 'previous'));
  });

  it('refuses a second renderer beside the one S02 delivered', () => {
    // Two `<svg>` roots are two renderers whatever the second is called, and the
    // second arrives in a file no rule was written to name — which is why the
    // count is taken over the whole feature rather than over a known list.
    const root = rootWith({
      [`${FEATURE}/components/studio-second-stage.tsx`]: 'export const S = () => <svg />;',
    });
    assert.ok(mentions(failuresOf(checkPreview, root), 'opens 2 <svg> roots'));
  });

  it('refuses a renderer inside the bootstrap screen S01 owns', () => {
    // The original S01 rule, unchanged and still biting: the stage may exist,
    // but not here.
    const root = rootWith({
      screen: file('screen').replace('<div className="studio">', '<div className="studio"><svg />'),
    });
    assert.ok(mentions(failuresOf(checkPreview, root), 'bootstrap screen builds a renderer'));
  });

  it('refuses any renderer at all in the world before S02', () => {
    const root = rootWith({
      phase: file('phase').replace(
        /\nAPP3-S02 = COMPLETE[^\n]*\n/,
        '\nAPP3-S02 = READY — NOT STARTED\n',
      ),
    });
    assert.ok(mentions(failuresOf(checkPreview, root), 'expected exactly 0'));
  });

  it('refuses a canvas in either world', () => {
    const root = rootWith({
      [`${FEATURE}/components/studio-raster.tsx`]: 'export const S = () => <canvas />;',
    });
    assert.ok(mentions(failuresOf(checkPreview, root), '<canvas'));
  });
});

describe('bootstrap and the secret boundary', () => {
  it('refuses a literal mode discriminator', () => {
    const root = rootWith({
      sessionService: file('sessionService').replace(
        'CloneDesignSessionBodyMode.CLONE_TEMPLATE',
        "'CLONE_TEMPLATE'",
      ),
    });
    assert.ok(mentions(failuresOf(checkSession, root), 'CLONE_TEMPLATE'));
  });

  it('refuses an unguarded duplicate submission', () => {
    const root = rootWith({
      sessionHook: file('sessionHook').replace('if (create.isPending) return;', ''),
    });
    assert.ok(mentions(failuresOf(checkSession, root), 'duplicate bootstrap'));
  });

  it('refuses a clone that falls back to a blank session', () => {
    const root = rootWith({
      sessionHook: file('sessionHook').replace(
        'onError: (error, input) => {',
        'onError: (error, input) => {\n      void createBlankSession;',
      ),
    });
    assert.ok(mentions(failuresOf(checkSession, root), 'falls back'));
  });

  it('refuses a Session id written to browser storage', () => {
    const root = rootWith({
      sessionHook: file('sessionHook').replace(
        'setSnapshot(created);',
        'setSnapshot(created); window.localStorage.setItem("s", created.sessionId);',
      ),
    });
    assert.ok(mentions(failuresOf(checkSession, root), 'localStorage'));
  });

  it('refuses a Session identity reaching the S02 interaction store', () => {
    // The half of the old blanket Zustand ban that actually mattered. S02
    // legitimately introduced a store, so the rule is now asserted where it
    // bites — a store that could hold a session id, rather than a store at all.
    const root = rootWith({
      [`${FEATURE}/store/studio-interaction.store.ts`]:
        'export const s = { selectedElementId: null, sessionId: null };',
    });
    assert.ok(mentions(failuresOf(checkSession, root), 'Session identity may reach'));
  });

  it('refuses an expiry not bound to the 401 the API answers', () => {
    const root = rootWith({
      sessionHook: file('sessionHook').replaceAll('HTTP_UNAUTHORIZED', 'ANY_FAILURE'),
    });
    assert.ok(mentions(failuresOf(checkSession, root), '401'));
  });
});

describe('the pre-S01 world', () => {
  it('refuses a Studio route that exists before the checkpoint that owns it', () => {
    const root = rootWith({ phase: beforeS01() });
    assert.ok(existsSync(join(root, CANONICAL_FILES.route)));
    assert.ok(mentions(failuresOf(checkRoute, root), 'before APP3-S01 delivered it'));
  });

  it('refuses a design row approved before its checkpoint opened', () => {
    const root = rootWith({ phase: beforeS01() });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'expected REVIEW_REQUIRED'));
  });
});
