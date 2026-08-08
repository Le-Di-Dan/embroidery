/**
 * Regressions for the `APP3-A01` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The mutations worth reading
 * twice are the ones that leave a *working screen*:
 *
 * - a Studio design row quietly approved, which licenses a checkpoint nobody
 *   reviewed and which no test of A01's own behaviour could ever notice;
 * - `retry: true` on the replace mutation, which turns a stale-token conflict
 *   into a second attempt with the same stale token;
 * - the conflict test widened from the domain code to the bare `409`, which
 *   offers a destructive reload for failures reloading cannot fix;
 * - the viewport hook defaulting to `mobile`, which hides the whole editor from
 *   a desktop operator whenever `matchMedia` is unavailable.
 *
 * The checker is run as a subprocess against a temp root, because it derives
 * its repository root from its own location — so a copy of the gate in a copied
 * tree checks that tree.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'tools/check-app3-a01.mjs';

/** Everything the gate reads. A path missing here shows up as a failed baseline. */
const COPIED = [
  GATE,
  'package.json',
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  'docs/design/FIGMA_DESIGN_INDEX.md',
  'packages/styles/src/settings/_color.scss',
  'packages/contracts/openapi/openapi.generated.json',
  'packages/api-client/src/generated/embroidery-api.ts',
  'apps/admin/src/app',
  'apps/admin/src/shared',
  'apps/admin/src/features/product-placement',
  'apps/admin/test',
];

const PHASE_PLAN = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
const REGISTRY = 'docs/design/FIGMA_DESIGN_INDEX.md';
const STYLESHEET = 'apps/admin/src/features/product-placement/styles/product-placement.scss';
const MUTATION = 'apps/admin/src/features/product-placement/hooks/use-placement-mutation.ts';
const VIEWPORT = 'apps/admin/src/features/product-placement/hooks/use-viewport-mode.ts';
const SCREEN = 'apps/admin/src/features/product-placement/components/product-placement-screen.tsx';
const HIERARCHY =
  'apps/admin/src/features/product-placement/components/placement-hierarchy-panel.tsx';
const SERVICE = 'apps/admin/src/features/product-placement/services/product-placement.service.ts';
const BODY = 'apps/admin/src/features/product-placement/model/placement-body.ts';
const FAILURE = 'apps/admin/src/features/product-placement/model/placement-failure.ts';
const ROUTE = 'apps/admin/src/app/(protected)/products/[productId]/placement/page.tsx';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let pristine;
function baseRoot() {
  if (pristine !== undefined) return pristine;
  pristine = mkdtempSync(join(tmpdir(), 'app3-a01-base-'));
  temporaries.push(pristine);
  for (const relative of COPIED) {
    const target = join(pristine, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target, { recursive: true });
  }
  return pristine;
}

/** A fresh mutable copy of the pristine tree. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-a01-'));
  temporaries.push(dir);
  cpSync(baseRoot(), dir, { recursive: true });
  return dir;
}

const readAt = (root, relative) => readFileSync(join(root, relative), 'utf8');
const writeAt = (root, relative, text) => {
  writeFileSync(join(root, relative), text);
};

/** Replaces `from` with `to`, refusing a mutation that would be a no-op. */
function edit(root, relative, from, to) {
  const text = readAt(root, relative);
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `mutation anchor must be unique in ${relative} (found ${count})`);
  writeAt(root, relative, text.replace(from, to));
}

function run(root) {
  const result = spawnSync(process.execPath, [join(root, GATE)], { encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Mutates a copy and asserts the gate refuses it, naming the rule that fired. */
function refuses(mutate, needle) {
  const root = scratch();
  mutate(root);
  const { code, output } = run(root);
  assert.equal(code, 1, `expected the gate to fail\n${output}`);
  assert.ok(output.includes(needle), `expected a failure mentioning "${needle}", got:\n${output}`);
}

describe('baseline', () => {
  it('passes against an unmutated copy of the repository', () => {
    const { code, output } = run(scratch());
    assert.equal(code, 0, output);
    assert.match(output, /APP3-A01 check passed/);
  });

  it('passes against the real repository', () => {
    const result = spawnSync(process.execPath, [join(REPO_ROOT, GATE)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
});

describe('entry authority', () => {
  it('refuses a D01 that is only delivered, not accepted', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-D01 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-D01 = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-D01 is accepted',
    );
  });

  it('refuses an unaccepted D01-C1 correction', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-D01-C1 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-D01-C1 = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-D01-C1 is accepted',
    );
  });

  it('refuses an unaccepted backend predecessor', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-B01 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-B01 = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-B01 is accepted',
    );
  });

  it('refuses a frontend gate that is still closed', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nFRONTEND_GATE = OPEN —',
          '\nFRONTEND_GATE = APP3-D01 — AWAITING_DESIGN_APPROVAL —',
        ),
      'the frontend gate is open',
    );
  });
});

describe('design registry', () => {
  it('refuses an A01 screen row that is not approved for implementation', () => {
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text
        .split('\n')
        .find((row) => row.startsWith('| FIG-ADMIN-PLACEMENT-DESKTOP-DEFAULT |'));
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('APPROVED_FOR_IMPLEMENTATION', 'REVIEW_REQUIRED')),
      );
    }, 'FIG-ADMIN-PLACEMENT-DESKTOP-DEFAULT is approved');
  });

  it('refuses a missing 1280 responsive reference approval', () => {
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text
        .split('\n')
        .find((row) => row.startsWith('| FIG-ADMIN-PLACEMENT-NARROW-1280 |'));
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('APPROVED_FOR_IMPLEMENTATION', 'REVIEW_REQUIRED')),
      );
    }, 'FIG-ADMIN-PLACEMENT-NARROW-1280 is approved');
  });

  it('refuses an unapproved canonical Input', () => {
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text.split('\n').find((row) => row.startsWith('| FIG-DS-INPUT |'));
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('APPROVED_FOR_IMPLEMENTATION', 'REVIEW_REQUIRED')),
      );
    }, 'FIG-DS-INPUT is canonical and approved');
  });

  // The other direction. Approval is scoped to what A01/A02/A03 need; a gate
  // that only checked for approval would pass on a registry that had licensed
  // the entire phase by accident.
  it('refuses a Studio row approved without its checkpoint', () => {
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text
        .split('\n')
        .find((row) => row.startsWith('| FIG-STUDIO-STAGE-DESKTOP-SELECTED |'));
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION')),
      );
    }, 'Studio rows are still unapproved');
  });

  it('refuses an A04 lifecycle row approved without its checkpoint', () => {
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text
        .split('\n')
        .find((row) => row.startsWith('| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY |'));
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION')),
      );
    }, 'A04 lifecycle rows are still unapproved');
  });
});

describe('one screen, one protected route', () => {
  it('refuses a second placement route', () => {
    refuses((root) => {
      const target = join(root, 'apps/admin/src/app/(protected)/placement/page.tsx');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'export default function Page() { return null; }\n');
    }, 'exactly one placement route');
  });

  it('refuses a placement route outside the protected group', () => {
    refuses((root) => {
      rmSync(join(root, 'apps/admin/src/app/(protected)/products'), {
        recursive: true,
        force: true,
      });
      const target = join(root, 'apps/admin/src/app/products/[productId]/placement/page.tsx');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'export default function Page() { return null; }\n');
    }, 'sits in the protected route group');
  });

  it('refuses a route segment that became a client component', () => {
    refuses(
      (root) =>
        edit(
          root,
          ROUTE,
          'import { ProductPlacementScreen }',
          "'use client';\nimport { ProductPlacementScreen }",
        ),
      'is a thin boundary',
    );
  });

  it('refuses a checkpoint that started the template editor', () => {
    refuses((root) => {
      mkdirSync(join(root, 'apps/admin/src/features/template-editor'), { recursive: true });
      writeFileSync(join(root, 'apps/admin/src/features/template-editor/index.ts'), 'export {};\n');
    }, 'no template-editor feature was created');
  });
});

describe('generated-client boundary', () => {
  it('refuses raw transport in the feature', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          'const response = await adminProductPlacementGet(productId, requestOptions(signal));',
          'const response = await fetch(`/x`).then((r) => r.json());',
        ),
      'uses no raw transport',
    );
  });

  it('refuses a hard-coded placement endpoint path', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          'export async function fetchPlacement(',
          "export const PATH = '/api/admin/products';\nexport async function fetchPlacement(",
        ),
      'does not duplicate the endpoint path',
    );
  });

  it('refuses reaching the public placement read', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          '  adminProductPlacementGet,',
          '  adminProductPlacementGet,\n  publicProductPlacementGet,',
        ),
      'does not reach the public placement read',
    );
  });

  it('refuses the operations being imported from more than one module', () => {
    refuses((root) => {
      writeAt(
        root,
        'apps/admin/src/features/product-placement/services/second.service.ts',
        "import { adminProductPlacementGet, adminProductPlacementReplace } from '@embroidery/api-client';\nexport const x = [adminProductPlacementGet, adminProductPlacementReplace];\n",
      );
    }, 'both generated operations are consumed');
  });
});

describe('concurrency and conflict', () => {
  it('refuses a body that stops echoing the seeded token', () => {
    refuses(
      (root) =>
        edit(
          root,
          BODY,
          'expectedUpdatedAt: draft.expectedUpdatedAt,',
          'expectedUpdatedAt: new Date().toISOString(),',
        ),
      'expectedUpdatedAt is sent from the draft seed',
    );
  });

  it('refuses a replace mutation that retries', () => {
    // A retry re-sends the token the server just rejected.
    refuses((root) => edit(root, MUTATION, 'retry: false', 'retry: true'), 'never retries');
  });

  it('refuses a conflict test widened past the domain code', () => {
    refuses(
      (root) =>
        edit(
          root,
          FAILURE,
          "return classifySaveFailure(error) === 'version-conflict';",
          'return normalizedOf(error)?.httpStatus === 409;',
        ),
      'only the exact domain code opens the reload path',
    );
  });

  it('refuses a body mapper that stops expressing retirement by omission', () => {
    refuses(
      (root) =>
        edit(
          root,
          BODY,
          'return rows.filter((row) => !row.removed && row.retiredAt === null);',
          'return rows;',
        ),
      'removal is expressed by omission',
    );
  });

  it('refuses a hierarchy that filters retired rows out of view', () => {
    refuses(
      (root) =>
        edit(
          root,
          HIERARCHY,
          'const areas = [...side.areas].sort(compareRows);',
          'const areas = [...side.areas].filter((a) => a.retiredAt !== null ? false : true).sort(compareRows);',
        ),
      'retired rows are rendered',
    );
  });
});

describe('responsive behaviour', () => {
  it('refuses a changed authoring floor', () => {
    refuses(
      (root) =>
        edit(
          root,
          VIEWPORT,
          'export const PLACEMENT_AUTHORING_MIN_WIDTH_PX = 1024;',
          'export const PLACEMENT_AUTHORING_MIN_WIDTH_PX = 640;',
        ),
      'the authoring floor is a named constant',
    );
  });

  it('refuses a viewport hook that fails to mobile', () => {
    // An unknown viewport must never hide the editor from a desktop operator.
    refuses(
      (root) =>
        edit(
          root,
          VIEWPORT,
          "useState<ViewportMode>('desktop')",
          "useState<ViewportMode>('mobile')",
        ),
      'an unknown viewport defaults to desktop',
    );
  });

  it('refuses a screen with no mobile branch', () => {
    refuses(
      (root) => edit(root, SCREEN, "if (viewport === 'mobile') {", 'if (false) {'),
      'mobile renders the notice instead of the editor',
    );
  });

  it('refuses a stylesheet with no narrow-desktop rule', () => {
    refuses(
      (root) =>
        edit(root, STYLESHEET, '@media (max-width: $placement-narrow-desktop)', '@media print'),
      'a narrow-desktop rule exists',
    );
  });
});

describe('design-system tokens', () => {
  it('refuses a literal colour in the stylesheet', () => {
    refuses(
      (root) =>
        edit(
          root,
          STYLESHEET,
          'background: styles.$color-overlay-scrim;',
          'background: rgba(0, 0, 0, 0.45);',
        ),
      'hard-codes no colour',
    );
  });

  it('refuses a scrim that stops binding the canonical token', () => {
    refuses((root) => {
      // Removed entirely rather than swapped for a literal, so this case fails
      // on the binding rule and not on the colour-literal rule above.
      edit(
        root,
        STYLESHEET,
        'background: styles.$color-overlay-scrim;',
        'background: styles.$color-background-secondary;',
      );
    }, 'binds the canonical token');
  });

  it('refuses a scrim token defined twice in the shared package', () => {
    refuses(
      (root) =>
        edit(
          root,
          'packages/styles/src/settings/_color.scss',
          '$color-overlay-scrim: rgba(23, 23, 23, 0.45);',
          '$color-overlay-scrim: rgba(23, 23, 23, 0.45);\n$color-overlay-scrim: rgba(0, 0, 0, 0.5);',
        ),
      'defined once in the shared package',
    );
  });

  it('refuses a second competing shared field primitive', () => {
    refuses((root) => {
      writeAt(
        root,
        'apps/admin/src/shared/forms/placement-input.tsx',
        'export function PlacementInput() { return null; }\n',
      );
    }, 'exactly one shared Admin field primitive');
  });
});

describe('contract and governance', () => {
  it('refuses an OpenAPI document edited by this checkpoint', () => {
    refuses((root) => {
      const text = readAt(root, 'packages/contracts/openapi/openapi.generated.json');
      writeAt(
        root,
        'packages/contracts/openapi/openapi.generated.json',
        text.replace('{', '{"x-APP3-A01":1,'),
      );
    }, 'carries no A01 edit');
  });

  it('refuses a generated client missing a placement operation', () => {
    refuses(
      (root) =>
        edit(
          root,
          'packages/api-client/src/generated/embroidery-api.ts',
          'export const adminProductPlacementReplace',
          'const adminProductPlacementReplaceRemoved',
        ),
      'still exports both operations',
    );
  });

  it('refuses a new root package.json script', () => {
    refuses((root) => {
      const manifest = JSON.parse(readAt(root, 'package.json'));
      manifest.scripts['check:app3-a01'] = 'node tools/check-app3-a01.mjs';
      writeAt(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
    }, 'root scripts remain 30');
  });

  it('refuses a production file past the 400-line limit', () => {
    refuses((root) => {
      const text = readAt(root, BODY);
      writeAt(root, BODY, `${text}\n${'// filler\n'.repeat(420)}`);
    }, 'within 400 lines');
  });
});
