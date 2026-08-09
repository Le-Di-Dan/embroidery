/**
 * Regressions for `tools/check-app3-a02.mjs`.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the gate refuses it. A gate nobody has tried to break is
 * a gate nobody knows the strength of.
 *
 * The mutations worth reading twice are the ones that leave a **working**
 * screen. A `v1` fabricated in the version cell renders beautifully and is a
 * lie about every published template. A detail read added to the curated client
 * boundary compiles, passes every component test, and turns a keyset page into
 * N+1 requests. An A04 lifecycle row flipped to approved makes a publish button
 * look licensed. None of the three is visible in a rendered DOM, which is why
 * they are checked here.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'tools/check-app3-a02.mjs';

/** Everything the gate reads. */
const COPIED = [
  GATE,
  'package.json',
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  'docs/implementation/SCOPED_COMMAND_INDEX.md',
  'docs/design/FIGMA_DESIGN_INDEX.md',
  'packages/contracts/openapi/openapi.generated.json',
  'packages/api-client/src/generated/embroidery-api.ts',
  'packages/api-client/src/index.ts',
  'apps/admin/src/app',
  'apps/admin/src/features/admin-shell',
  'apps/admin/src/features/design-templates',
  'apps/admin/test',
];

const PHASE_PLAN = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
const REGISTRY = 'docs/design/FIGMA_DESIGN_INDEX.md';
const COMMAND_INDEX = 'docs/implementation/SCOPED_COMMAND_INDEX.md';
const CURATED_CLIENT = 'packages/api-client/src/index.ts';
const FEATURE = 'apps/admin/src/features/design-templates';
const ROWS = `${FEATURE}/model/design-template-rows.ts`;
const SERVICE = `${FEATURE}/services/design-template.service.ts`;
const TABLE = `${FEATURE}/components/design-template-table.tsx`;
const STYLESHEET = `${FEATURE}/styles/design-templates.scss`;
const ROUTE = 'apps/admin/src/app/(protected)/design-templates/page.tsx';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let pristine;
function baseRoot() {
  if (pristine !== undefined) return pristine;
  pristine = mkdtempSync(join(tmpdir(), 'app3-a02-base-'));
  temporaries.push(pristine);
  for (const relative of COPIED) {
    const target = join(pristine, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target, { recursive: true });
  }
  return pristine;
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-a02-'));
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
  it('passes against an unmutated copy', () => {
    const { code, output } = run(scratch());
    assert.equal(code, 0, output);
  });
});

describe('entry authority', () => {
  it('refuses an unaccepted B03, whose operations this screen consumes', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-B03 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-B03 = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-B03 is accepted',
    );
  });

  it('refuses an unaccepted A01, the predecessor frontend checkpoint', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-A01 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-A01 = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-A01 is accepted',
    );
  });
});

describe('design registry', () => {
  it('refuses a list row that is not approved for implementation', () => {
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text
        .split('\n')
        .find((row) => row.startsWith('| FIG-ADMIN-TEMPLATELIST-DESKTOP-EMPTY |'));
      assert.ok(line !== undefined, 'the empty-state row must exist to be broken');
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('APPROVED_FOR_IMPLEMENTATION', 'REVIEW_REQUIRED')),
      );
    }, 'FIG-ADMIN-TEMPLATELIST-DESKTOP-EMPTY is approved');
  });

  it('refuses a blanket approval that licenses APP3-A04 early', () => {
    // The one mutation a per-row approval check cannot see: the rows A02 needs
    // are all still approved, so a gate that only looked forward would pass.
    refuses((root) => {
      const text = readAt(root, REGISTRY);
      const line = text
        .split('\n')
        .find((row) => row.startsWith('| FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY |'));
      assert.ok(line !== undefined, 'the A04 row must exist to be broken');
      writeAt(
        root,
        REGISTRY,
        text.replace(line, line.replace('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION')),
      );
    }, 'A04 lifecycle rows are still unapproved');
  });
});

describe('client boundary', () => {
  it('refuses a detail read added to the curated export', () => {
    refuses(
      (root) =>
        edit(
          root,
          CURATED_CLIENT,
          'adminDesignTemplateCreate, adminDesignTemplateList',
          'adminDesignTemplateCreate, adminDesignTemplateDetail, adminDesignTemplateList',
        ),
      'adminDesignTemplateDetail stays withheld',
    );
  });

  it('refuses a lifecycle operation added to the curated export', () => {
    refuses(
      (root) =>
        edit(
          root,
          CURATED_CLIENT,
          'adminDesignTemplateCreate, adminDesignTemplateList',
          'adminDesignTemplateCreate, adminDesignTemplateList, adminDesignTemplatePublish',
        ),
      'adminDesignTemplatePublish stays withheld',
    );
  });

  it('refuses a second module reaching the generated operations', () => {
    refuses(
      (root) =>
        edit(
          root,
          TABLE,
          'export function DesignTemplateTable',
          'const listOperation = adminDesignTemplateList;\n\nexport function DesignTemplateTable',
        ),
      'consumed in exactly one service',
    );
  });

  it('refuses raw transport in the feature', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          'export async function fetchTemplatePage',
          'export async function unused() {\n  return fetch("/x");\n}\n\nexport async function fetchTemplatePage',
        ),
      'uses no raw transport',
    );
  });
});

describe('published capabilities only', () => {
  it('refuses a search request parameter the contract does not publish', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          '      { ...toListParams(filters, pageSize),',
          '      { search: filters.status, ...toListParams(filters, pageSize),',
        ),
      'builds no unsupported request parameter',
    );
  });

  it('refuses a decoded cursor', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          'export async function createTemplate',
          'const decode = (c: string) => JSON.parse(atob(c));\n\nexport async function createTemplate',
        ),
      'forwarded, never parsed',
    );
  });
});

describe('truthful cells', () => {
  it('refuses a fabricated version number', () => {
    // Renders perfectly; mislabels every template the list never reported a
    // version for, which is all of them.
    refuses(
      (root) =>
        edit(
          root,
          ROWS,
          "    return { kind: 'not-in-list' };",
          "    return { kind: 'version', version: 1, published: false };",
        ),
      'unreported version is distinguished',
    );
  });

  it('refuses a client-side re-sort of the server page', () => {
    refuses(
      (root) =>
        edit(
          root,
          ROWS,
          'export function flattenTemplates',
          'const reorder = (rows: readonly unknown[]) => [...rows].sort();\n\nexport function flattenTemplates',
        ),
      'server ordering is preserved',
    );
  });
});

describe('presentation', () => {
  it('refuses a colour literal in the stylesheet', () => {
    refuses(
      (root) => edit(root, STYLESHEET, 'styles.$color-overlay-scrim', 'rgba(0, 0, 0, 0.5)'),
      'hard-codes no colour',
    );
  });

  it('refuses a desktop table that survives into the mobile breakpoint', () => {
    refuses(
      (root) =>
        edit(
          root,
          STYLESHEET,
          '.design-template-table {\n    display: none;',
          '.design-template-table {\n    overflow-x: auto;',
        ),
      'hidden rather than scrolled sideways',
    );
  });
});

describe('scope', () => {
  it('refuses a client component in the route segment', () => {
    refuses((root) => edit(root, ROUTE, 'import', "'use client';\n\nimport"), 'thin boundary');
  });

  it('refuses an APP3-A03 editor feature started here', () => {
    refuses((root) => {
      mkdirSync(join(root, 'apps/admin/src/features/template-editor'), { recursive: true });
      writeAt(root, 'apps/admin/src/features/template-editor/index.ts', 'export {};\n');
    }, 'no template-editor feature was created');
  });

  it('refuses an OpenAPI surface change', () => {
    // A path that does not exist yet. `/{templateId}/publish` does — `APP3-B04`
    // published the lifecycle operations months ago, and this screen withholds
    // them at the *client* boundary, not by their absence from the contract.
    refuses((root) => {
      const document = JSON.parse(
        readAt(root, 'packages/contracts/openapi/openapi.generated.json'),
      );
      document.paths['/api/admin/design-templates/{templateId}/duplicate'] = { post: {} };
      writeAt(
        root,
        'packages/contracts/openapi/openapi.generated.json',
        JSON.stringify(document, null, 2),
      );
    }, 'surface is unchanged at 32 paths');
  });

  it('refuses a new root script', () => {
    refuses((root) => {
      const manifest = JSON.parse(readAt(root, 'package.json'));
      manifest.scripts['check:app3-a02'] = 'node tools/check-app3-a02.mjs';
      writeAt(root, 'package.json', JSON.stringify(manifest, null, 2));
    }, 'root scripts remain 30');
  });

  it('refuses an unregistered scoped command', () => {
    refuses(
      (root) => edit(root, COMMAND_INDEX, '| `CMD-CHECK-APP3-A02` |', '| `CMD-CHECK-APP3-A99` |'),
      'CMD-CHECK-APP3-A02 is registered',
    );
  });

  it('refuses a registered id that is not bound to its command', () => {
    // A row can exist and still point somewhere else. Renaming the id to a
    // *prefix-compatible* neighbour is the mutation a substring scan survives.
    refuses(
      (root) => edit(root, COMMAND_INDEX, '`node tools/check-app3-a02.mjs`', '`true`'),
      'CMD-CHECK-APP3-A02 is registered',
    );
  });
});
