/**
 * Regressions for the `APP3-A01-C1` background rules.
 *
 * Split from `check-app3-a01.test.mjs` because that file crossed the 600-line
 * test limit when the correction landed. Same harness, same gate: every case
 * still runs the one A01 command against a mutated copy of the repository.
 *
 * The mutations worth reading twice are the ones that leave a **working**
 * screen: an object URL created and never revoked, which leaks protected media
 * with nothing in the DOM to show for it; `placeholderData`, which paints the
 * previous Side image under the new Side areas; and a fetch that stops checking
 * the persisted association, which presents an unsaved replacement as applied.
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

/** Everything the gate reads, including the rule module it delegates to. */
const COPIED = [
  GATE,
  'tools/check-app3-a01-background.mjs',
  'package.json',
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  'docs/design/FIGMA_DESIGN_INDEX.md',
  'packages/styles/src/settings/_color.scss',
  'packages/contracts/openapi/openapi.generated.json',
  'packages/api-client/src/generated/embroidery-api.ts',
  'packages/api-client/src/index.ts',
  'apps/admin/src/app',
  'apps/admin/src/shared',
  'apps/admin/src/features/product-placement',
  'apps/admin/test',
];

const PHASE_PLAN = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
const SCREEN = 'apps/admin/src/features/product-placement/components/product-placement-screen.tsx';
const CURATED_CLIENT = 'packages/api-client/src/index.ts';
const BACKGROUND_SERVICE =
  'apps/admin/src/features/product-placement/services/side-background.service.ts';
const BACKGROUND_HOOK = 'apps/admin/src/features/product-placement/hooks/use-side-background.ts';
const PREVIEW = 'apps/admin/src/features/product-placement/components/placement-preview.tsx';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let pristine;
function baseRoot() {
  if (pristine !== undefined) return pristine;
  pristine = mkdtempSync(join(tmpdir(), 'app3-a01-c1-base-'));
  temporaries.push(pristine);
  for (const relative of COPIED) {
    const target = join(pristine, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target, { recursive: true });
  }
  return pristine;
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-a01-c1-'));
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
  assert.equal(
    code,
    1,
    `expected the gate to fail
${output}`,
  );
  assert.ok(
    output.includes(needle),
    `expected a failure mentioning "${needle}", got:
${output}`,
  );
}

describe('baseline', () => {
  it('passes against an unmutated copy', () => {
    const { code, output } = run(scratch());
    assert.equal(code, 0, output);
  });
});
describe('APP3-A01-C1 — the authorized Side background', () => {
  it('refuses an unaccepted B02A, whose operation this consumes', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-B02A = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-B02A = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-B02A is accepted',
    );
  });

  it('refuses a blocker that is recorded closed by nothing', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          'A01_CORRECTION_BLOCKER = CLOSED_BY_APP3-A01-C1',
          'A01_CORRECTION_BLOCKER = WAITING_FOR_APP3_B02A_REVIEW_ACCEPTANCE',
        ),
      'blocker this correction exists to close is still open',
    );
  });

  it('refuses withdrawing the operation from the curated boundary', () => {
    refuses(
      (root) =>
        edit(
          root,
          CURATED_CLIENT,
          "export { adminProductSideBackgroundGet } from './generated/embroidery-api';",
          '',
        ),
      'not on the curated boundary',
    );
  });

  it('refuses exposing the public delivery route beside it', () => {
    // It requires a PUBLISHED Product, which placement authoring does not have.
    refuses(
      (root) =>
        edit(
          root,
          CURATED_CLIENT,
          "export { adminProductSideBackgroundGet } from './generated/embroidery-api';",
          "export { adminProductSideBackgroundGet, publicProductSideBackgroundGet } from './generated/embroidery-api';",
        ),
      'public side-background route was exposed',
    );
  });

  it('refuses a second consumer of the operation', () => {
    refuses((root) => {
      writeAt(
        root,
        BACKGROUND_HOOK,
        `${readAt(root, BACKGROUND_HOOK)}\nimport { adminProductSideBackgroundGet } from '@embroidery/api-client';\nexport const second = adminProductSideBackgroundGet;\n`,
      );
    }, 'consumed in exactly one service');
  });

  it('refuses a created object URL that is never revoked', () => {
    // Nothing in the DOM would ever show the leak; only this can.
    refuses(
      (root) => edit(root, BACKGROUND_HOOK, 'URL.revokeObjectURL(url);\n', ''),
      'object URL is never revoked',
    );
  });

  it('refuses revocation that is not the effect cleanup', () => {
    refuses((root) => {
      const source = readAt(root, BACKGROUND_HOOK);
      writeAt(
        root,
        BACKGROUND_HOOK,
        source.replace(
          '    return () => {\n      URL.revokeObjectURL(url);\n      setObjectUrl(null);\n    };',
          '    URL.revokeObjectURL(url);\n    return undefined;',
        ),
      );
    }, 'revocation is not wired to the effect cleanup');
  });

  it('refuses retaining protected media after it stops being observed', () => {
    refuses(
      (root) => edit(root, BACKGROUND_HOOK, 'gcTime: 0,', 'gcTime: 300_000,'),
      'cached beyond its observers',
    );
  });

  it('refuses placeholderData carrying the previous Side image across a switch', () => {
    refuses(
      (root) =>
        edit(
          root,
          BACKGROUND_HOOK,
          'staleTime: 0,',
          'placeholderData: (p) => p,\n    staleTime: 0,',
        ),
      'keeps previous data across a key change',
    );
  });

  it('refuses a DOM image positioned by CSS instead of an SVG layer', () => {
    // Anchored to the JSX element, not to the first `<image` in the file — the
    // doc comment above it mentions one too, and mutating prose would leave the
    // rendering untouched and the gate correctly passing.
    refuses(
      (root) => edit(root, PREVIEW, '            <image\n', '            <img\n'),
      'not drawn in the canvas coordinate space',
    );
  });

  it('refuses a background drawn outside the Side pixel space', () => {
    refuses(
      (root) => edit(root, PREVIEW, 'width={canvasWidth}', 'width="100%"'),
      'not drawn in the canvas coordinate space',
    );
  });

  it('refuses exposing the artwork as a control', () => {
    refuses(
      (root) => edit(root, PREVIEW, '              aria-hidden="true"\n', ''),
      'exposed to assistive technology as a control',
    );
  });

  it('refuses fetching without checking the persisted association', () => {
    // Otherwise an unsaved replacement is represented by the bytes it replaces.
    refuses(
      (root) => edit(root, SCREEN, 'backgroundMatchesServer(side, model)', 'true'),
      'fetches without checking the persisted association',
    );
  });

  it('refuses an asset-keyed delivery bypass', () => {
    refuses((root) => {
      writeAt(
        root,
        BACKGROUND_SERVICE,
        `${readAt(root, BACKGROUND_SERVICE)}\nexport const bypass = (id: string) => \`/api/admin/assets/\${id}/preview\`;\n`,
      );
    }, 'asset-by-id delivery address was constructed');
  });

  it('refuses background code that exists before the correction is recorded', () => {
    // The other direction: a tree carrying the fix but not the record, or a
    // revert that left the code behind, both fail rather than pass silently.
    refuses((root) => {
      edit(
        root,
        PHASE_PLAN,
        '\nAPP3-A01-C1 = COMPLETE — REVIEW_DELIVERED',
        '\nAPP3-A01-C1 = READY — NOT STARTED',
      );
      edit(
        root,
        PHASE_PLAN,
        'A01_CORRECTION_BLOCKER = CLOSED_BY_APP3-A01-C1',
        'A01_REVIEW_BLOCKER_OPEN = 1',
      );
    }, 'background delivery code exists but APP3-A01-C1 is not recorded');
  });
});
