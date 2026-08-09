/**
 * Regressions for `tools/check-app3-a03.mjs`.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the gate refuses it. A gate nobody has tried to break is
 * a gate nobody knows the strength of.
 *
 * The mutations worth reading twice are the ones that leave a **working**
 * editor. Classifying the conflict on `409` alone offers "keep your local draft"
 * to an operator whose draft can never be saved. A second schema-version
 * constant agrees with `APP3-P01` right up until P01 bumps its own. A rotation
 * computed locally renders plausibly and disagrees with the geometry the publish
 * guard will apply. Pre-incrementing the version label reads correctly on every
 * successful save and lies on every failed one. None of the four is visible in a
 * rendered DOM, which is why they are checked here.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'tools/check-app3-a03.mjs';

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
  'packages/database/migrations',
  'apps/admin/src/app',
  'apps/admin/src/features/design-templates',
  'apps/admin/src/features/design-template-editor',
  'apps/admin/src/features/product-placement',
  'apps/admin/src/styles',
  'apps/admin/test',
];

const PHASE_PLAN = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
const REGISTRY = 'docs/design/FIGMA_DESIGN_INDEX.md';
const COMMAND_INDEX = 'docs/implementation/SCOPED_COMMAND_INDEX.md';
const CURATED_CLIENT = 'packages/api-client/src/index.ts';
const FEATURE = 'apps/admin/src/features/design-template-editor';
const LIST_FEATURE = 'apps/admin/src/features/design-templates';
const SERVICE = `${FEATURE}/services/design-template-editor.service.ts`;
const FAILURE = `${FEATURE}/model/editor-failure.ts`;
const STATE = `${FEATURE}/model/editor-state.ts`;
const SOURCE = `${FEATURE}/model/editor-source.ts`;
const DOCUMENT = `${FEATURE}/model/editor-document.ts`;
const SCOPE = `${FEATURE}/model/editor-scope.ts`;
const STAGE = `${FEATURE}/components/editor-stage.tsx`;
const LAYERS = `${FEATURE}/components/editor-layer-list.tsx`;
const SCREEN = `${FEATURE}/components/design-template-editor-screen.tsx`;
const MUTATION = `${FEATURE}/hooks/use-save-template-document.ts`;
const BACKGROUND = `${FEATURE}/hooks/use-editor-side-background.ts`;
const STYLESHEET = `${FEATURE}/styles/design-template-editor.scss`;
const TABLE = `${LIST_FEATURE}/components/design-template-table.tsx`;
const ROUTE = 'apps/admin/src/app/(protected)/design-templates/[templateId]/page.tsx';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let pristine;
function baseRoot() {
  if (pristine !== undefined) return pristine;
  pristine = mkdtempSync(join(tmpdir(), 'app3-a03-base-'));
  temporaries.push(pristine);
  for (const relative of COPIED) {
    const target = join(pristine, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target, { recursive: true });
  }
  return pristine;
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-a03-'));
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
  it('refuses an unaccepted B03A, whose save contract this screen implements', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-B03A = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-B03A = COMPLETE — REVIEW_DELIVERED',
        ),
      'APP3-B03A is accepted',
    );
  });

  it('refuses an unaccepted P01, which owns the document', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nAPP3-P01 = COMPLETE — REVIEW_ACCEPTED',
          '\nAPP3-P01 = COMPLETE — CORRECTION_REQUIRED',
        ),
      'APP3-P01 is accepted',
    );
  });

  it('refuses a closed TEMPLATE_SOURCE follow-up while intake is still absent', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          // Anchored to the A03 status block's own line. The identifier also
          // appears in the checkpoint's prose, so the bare id is not unique.
          '\nFU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED\nFU-APP3-TEMPLATE-SCOPE-EDIT-01',
          '\nFU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = CLOSED — DONE\nFU-APP3-TEMPLATE-SCOPE-EDIT-01',
        ),
      'TEMPLATE_SOURCE intake follow-up is still open',
    );
  });
});

describe('design authority', () => {
  it('refuses an editor row that is not approved for implementation', () => {
    refuses(
      (root) =>
        edit(
          root,
          REGISTRY,
          '| FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-CONFLICT | Admin | Admin template editor | Template Editor | Stale Version Conflict | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION',
          '| FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-CONFLICT | Admin | Admin template editor | Template Editor | Stale Version Conflict | Desktop 1440 | high-fidelity | REVIEW_REQUIRED',
        ),
      'FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-CONFLICT is approved',
    );
  });

  it('refuses a Studio row approved early, which would license the whole phase', () => {
    // Approval must stay scoped to the checkpoint that earned it. A blanket
    // approval is the failure mode this direction exists to catch.
    refuses(
      (root) =>
        edit(
          root,
          REGISTRY,
          '| FIG-STUDIO-SHELL-DESKTOP-DEFAULT | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Default | Desktop 1440 | high-fidelity | REVIEW_REQUIRED',
          '| FIG-STUDIO-SHELL-DESKTOP-DEFAULT | Storefront | Studio shell & template selection | Studio Shell + Template Picker | Default | Desktop 1440 | high-fidelity | APPROVED_FOR_IMPLEMENTATION',
        ),
      'FIG-STUDIO-SHELL-DESKTOP-DEFAULT is still unapproved',
    );
  });
});

describe('client boundary', () => {
  it('refuses a lifecycle operation added to the curated boundary', () => {
    // It compiles, every test passes, and a publish button becomes one import
    // away — which is the whole reason the absence is checked mechanically.
    refuses(
      (root) =>
        edit(
          root,
          CURATED_CLIENT,
          '  adminDesignTemplateSaveDocument,\n} from',
          '  adminDesignTemplateSaveDocument,\n  adminDesignTemplatePublish,\n} from',
        ),
      'adminDesignTemplatePublish stays withheld',
    );
  });

  it('refuses the detail read crossing without the save it belongs with', () => {
    refuses(
      (root) => edit(root, CURATED_CLIENT, '  adminDesignTemplateSaveDocument,\n} from', '} from'),
      'the detail read and the document save cross the boundary together',
    );
  });

  it('refuses a second module consuming the template operations', () => {
    refuses((root) => {
      const text = readAt(root, STAGE);
      writeAt(
        root,
        STAGE,
        `import { adminDesignTemplateDetail } from '@embroidery/api-client';\n${text}`,
      );
    }, 'consumed in exactly one service');
  });

  it('refuses a hard-coded endpoint path', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          'const body: SaveDesignTemplateDocumentBody',
          "const path = '/api/admin/design-templates';\n  const body: SaveDesignTemplateDocumentBody",
        ),
      'does not duplicate an endpoint path',
    );
  });
});

describe('the A02 activation', () => {
  it('refuses a detail read reaching the list, now that one exists', () => {
    // The N+1 rule used to prove itself by the operation being unreachable.
    // This is the world where it is reachable and must still never be called.
    refuses((root) => {
      const text = readAt(root, TABLE);
      writeAt(
        root,
        TABLE,
        text.replace(
          "import Link from 'next/link';",
          "import Link from 'next/link';\nimport { adminDesignTemplateDetail } from '@embroidery/api-client';",
        ),
      );
    }, 'still performs no detail read');
  });

  it('refuses a second spelling of the editor URL', () => {
    refuses(
      (root) =>
        edit(
          root,
          TABLE,
          'href={adminDesignTemplateEditorRoute(item.templateId)}',
          'href={`/design-templates/${item.templateId}`}',
        ),
      'no module spells the editor URL for itself',
    );
  });

  it('refuses stale copy telling the operator the editor does not exist', () => {
    refuses(
      (root) =>
        edit(
          root,
          `${LIST_FEATURE}/model/design-template-copy.ts`,
          "label: 'Mở trình chỉnh sửa',",
          "label: 'Mở trình chỉnh sửa',\n    unavailable: 'Trình chỉnh sửa mẫu sẽ có ở bước sau (APP3-A03).',",
        ),
      'no stale "editor unavailable" copy survives',
    );
  });
});

describe('document authority', () => {
  it('refuses a second schema-version constant', () => {
    // It agrees with P01 exactly until P01 bumps its own, and then it is a
    // silent second authority writing documents nothing can read.
    refuses(
      (root) =>
        edit(
          root,
          DOCUMENT,
          'schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,',
          'schemaVersion: 1,',
        ),
      'declares no schema version of its own',
    );
  });

  it('refuses an empty document that skips P01 validation', () => {
    refuses(
      (root) =>
        edit(root, DOCUMENT, 'return validateDesignDocumentStructure({', 'return okDocument({'),
      'validated by APP3-P01 itself',
    );
  });

  it('refuses a locally invented element limit', () => {
    refuses(
      (root) =>
        edit(
          root,
          DOCUMENT,
          'document.elements.length < DESIGN_DOCUMENT_LIMITS.maxElements',
          'document.elements.length < 100',
        ),
      // Named individually, because the *other* limit in the same function is
      // still derived correctly — a rule matching "some limit came from P01"
      // passes on a document module that hard-codes exactly one of them.
      'maxElements comes from APP3-P01',
    );
  });

  it('refuses a CSS font family in a document', () => {
    refuses(
      (root) =>
        edit(
          root,
          DOCUMENT,
          'fontId: INTER_CONTROLLED_FONT.fontId,',
          "fontId: INTER_CONTROLLED_FONT.fontId,\n    fontFamily: 'Inter, sans-serif',",
        ),
      'names no CSS font family',
    );
  });
});

describe('geometry authority', () => {
  it('refuses a rotation computed outside the engine', () => {
    refuses(
      (root) =>
        edit(
          root,
          STAGE,
          'const labelSize = canvasWidthPx / 40;',
          'const labelSize = Math.cos(canvasWidthPx) / 40;',
        ),
      'composes no transform of its own',
    );
  });

  it('refuses a local px-to-mm conversion', () => {
    refuses(
      (root) =>
        edit(
          root,
          STAGE,
          'const labelSize = canvasWidthPx / 40;',
          'const labelSize = document.placement.pxPerMm * 4;',
        ),
      'performs no px↔mm conversion',
    );
  });

  it('refuses a stage that computes selection bounds itself', () => {
    // Breaking the **call**, not the import. Deleting an import would make the
    // stage stop compiling; substituting a local box keeps it rendering and
    // silently disagrees with the geometry the publish guard will apply.
    refuses(
      (root) =>
        edit(
          root,
          STAGE,
          '  const bounds = getElementBounds(document, elementId);',
          '  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };',
        ),
      'the stage calls getElementBounds from the design engine',
    );
  });
});

describe('rendering architecture', () => {
  it('refuses a second renderer', () => {
    refuses((root) => {
      const text = readAt(root, STAGE);
      writeAt(root, STAGE, `import Konva from 'konva';\n${text}`);
    }, 'introduces no rendering engine');
  });

  it('refuses inline positional styles', () => {
    refuses(
      (root) =>
        edit(
          root,
          STAGE,
          '<div className="template-editor-stage__frame">',
          '<div className="template-editor-stage__frame" style={{ left: 0 }}>',
        ),
      'uses no inline style or CSS custom property',
    );
  });
});

describe('the save contract', () => {
  it('refuses a member the contract does not declare', () => {
    refuses(
      (root) =>
        edit(
          root,
          SERVICE,
          '    expectedCurrentVersion,\n    document:',
          "    expectedCurrentVersion,\n    status: 'DRAFT',\n    document:",
        ),
      'the body is exactly expectedCurrentVersion and document',
    );
  });

  it('refuses a fabricated first version', () => {
    // Reads correctly on every successful save and lies on every failed one.
    refuses(
      (root) =>
        edit(root, SOURCE, 'UNVERSIONED_EXPECTED_VERSION = 0', 'UNVERSIONED_EXPECTED_VERSION = 1'),
      'an unversioned template expects version 0',
    );
  });

  it('refuses a save that retries', () => {
    refuses(
      (root) => edit(root, MUTATION, '    retry: false,', '    retry: 2,'),
      'the mutation never retries',
    );
  });

  it('refuses a redundant detail read after a save', () => {
    refuses(
      (root) =>
        edit(
          root,
          MUTATION,
          'queryClient.setQueryData(designTemplateEditorKeys.detail(templateId), detail);',
          'void queryClient.refetchQueries({ queryKey: designTemplateEditorKeys.detail(templateId) });',
        ),
      'written to the cache instead of triggering a second read',
    );
  });
});

describe('conflict semantics', () => {
  it('refuses a 409 answered from the refusal alone', () => {
    // B03A answers 409 for a stale version *or* a template that is no longer a
    // DRAFT, and the envelope reduces both to `code: "CONFLICT"`. Collapsing
    // them offers "keep your local draft" to an operator whose draft can never
    // be saved.
    refuses(
      (root) =>
        edit(
          root,
          FAILURE,
          "if (normalized.httpStatus === HTTP_CONFLICT) return 'conflict-unresolved';",
          "if (normalized.httpStatus === HTTP_CONFLICT) return 'stale-version';",
        ),
      'a 409 is not classified from the error alone',
    );
  });

  it('refuses an unresolvable 409 defaulting to the unrecoverable branch', () => {
    refuses(
      (root) =>
        edit(
          root,
          FAILURE,
          "  if (status === undefined) return 'stale-version';",
          "  if (status === undefined) return 'not-editable';",
        ),
      'an unresolvable 409 defaults to the recoverable branch',
    );
  });

  it('refuses a server error code transcribed into the client', () => {
    refuses(
      (root) =>
        edit(
          root,
          FAILURE,
          'const HTTP_CONFLICT = 409;',
          "const HTTP_CONFLICT = 409;\nconst STALE = 'DESIGN_TEMPLATE_VERSION_CONFLICT';",
        ),
      'no server error vocabulary is transcribed into the client',
    );
  });

  it('refuses a dismissal that clears the conflict', () => {
    refuses(
      (root) =>
        edit(
          root,
          STATE,
          '      return { ...state, conflictDialogOpen: false };',
          '      return { ...state, conflictDialogOpen: false, conflicted: false };',
        ),
      'dismissing the dialog does not clear the conflict',
    );
  });

  it('refuses a save that stays enabled while the draft is stale', () => {
    refuses(
      (root) =>
        edit(
          root,
          STATE,
          'return editable && state.dirty && !state.saving && !state.conflicted;',
          'return editable && state.dirty && !state.saving;',
        ),
      'a conflicted draft cannot be saved',
    );
  });

  it('refuses an automatic merge', () => {
    refuses((root) => {
      const text = readAt(root, STATE);
      writeAt(root, STATE, `${text}\nexport function mergeDocuments(a, b) { return a ?? b; }\n`);
    }, 'performs no automatic retry or merge');
  });
});

describe('assets', () => {
  it('refuses a published-Template delivery route in the Admin editor', () => {
    refuses((root) => {
      const text = readAt(root, STAGE);
      writeAt(
        root,
        STAGE,
        `import { publicDesignTemplateDetail } from '@embroidery/api-client';\n${text}`,
      );
    }, 'reaches no published-Template or Session delivery route');
  });

  it('refuses a constructed storage address', () => {
    refuses(
      (root) =>
        edit(
          root,
          BACKGROUND,
          'const url = URL.createObjectURL(blob);',
          'const url = `https://minio.local/${String(sideId)}`;',
        ),
      'builds no storage address',
    );
  });

  it('refuses an object URL created outside the hook that revokes it', () => {
    refuses((root) => {
      const text = readAt(root, STAGE);
      writeAt(
        root,
        STAGE,
        text.replace(
          'const { canvasWidthPx, canvasHeightPx } = document.placement;',
          'const stray = URL.createObjectURL(new Blob());\n  const { canvasWidthPx, canvasHeightPx } = document.placement;',
        ),
      );
    }, 'created only where it is revoked');
  });

  it('refuses a third Side-background consumer', () => {
    refuses((root) => {
      const text = readAt(root, STAGE);
      writeAt(
        root,
        STAGE,
        `import { adminProductSideBackgroundGet } from '@embroidery/api-client';\n${text}`,
      );
    }, 'exactly two authorized Side-background consumers');
  });

  it('refuses an HTML image element for a Template asset', () => {
    refuses(
      (root) =>
        edit(
          root,
          `${FEATURE}/components/editor-stage-element.tsx`,
          '<g data-testid="editor-image-placeholder">',
          '<g data-testid="editor-image-placeholder"><img alt="" />',
        ),
      'renders no HTML image',
    );
  });
});

describe('status, scope and the image limitation', () => {
  it('refuses an editable status other than DRAFT', () => {
    refuses(
      (root) =>
        edit(
          root,
          SOURCE,
          "EDITABLE_TEMPLATE_STATUS = 'DRAFT'",
          "EDITABLE_TEMPLATE_STATUS = 'PUBLISHED'",
        ),
      'only DRAFT is editable',
    );
  });

  it('refuses a scope resolved by anything but id', () => {
    refuses(
      (root) =>
        edit(
          root,
          SCOPE,
          'candidate.id === scope.productSideId',
          'candidate.code === scope.productSideId',
        ),
      'the Side and Area are resolved by id',
    );
  });

  it('refuses a Product request for an unscoped template', () => {
    refuses(
      (root) =>
        edit(
          root,
          SCREEN,
          "viewport === 'mobile' || scopeRef === undefined ? null : scopeRef.productId,",
          'scopeRef?.productId ?? null,',
        ),
      'an unscoped template issues no Product request',
    );
  });

  it('refuses a scope mutation', () => {
    refuses((root) => {
      const text = readAt(root, SCOPE);
      writeAt(
        root,
        SCOPE,
        `import { adminProductPlacementReplace } from '@embroidery/api-client';\n${text}`,
      );
    }, 'the editor mutates no scope');
  });

  it('refuses an enabled add-image control while intake is absent', () => {
    refuses(
      (root) =>
        edit(
          root,
          LAYERS,
          '            disabled\n            aria-describedby="editor-add-image-reason"',
          '            aria-describedby="editor-add-image-reason"',
        ),
      'the add-image control is present and disabled with a reason',
    );
  });

  it('refuses a CATALOG_MEDIA substitution for the missing asset kind', () => {
    refuses((root) => {
      const text = readAt(root, LAYERS);
      writeAt(root, LAYERS, `const KIND = 'CATALOG_MEDIA';\n${text}`);
    }, 'no CATALOG_MEDIA or asset-upload substitution');
  });
});

describe('responsive and style', () => {
  it('refuses a viewport hook that fails to mobile when the answer is unknown', () => {
    refuses(
      (root) =>
        edit(
          root,
          `${FEATURE}/hooks/use-editor-viewport.ts`,
          "useState<EditorViewportMode>('desktop')",
          "useState<EditorViewportMode>('mobile')",
        ),
      'an unknown viewport fails safe to desktop',
    );
  });

  it('refuses a background request on a small viewport', () => {
    refuses(
      (root) =>
        edit(
          root,
          SCREEN,
          "    productId: viewport === 'mobile' ? null : (resolvedScope?.productId ?? null),",
          '    productId: resolvedScope?.productId ?? null,',
        ),
      'mobile issues no background request',
    );
  });

  it('refuses a stage track that can overflow at 1280', () => {
    refuses(
      (root) =>
        edit(
          root,
          STYLESHEET,
          'grid-template-columns: $editor-layers-min minmax(0, 1fr) $editor-inspector-min;',
          'grid-template-columns: $editor-layers-min 1fr $editor-inspector-min;',
        ),
      'the stage may shrink rather than overflow',
    );
  });

  it('refuses an inspector whose controls may exceed its column', () => {
    refuses(
      (root) => edit(root, STYLESHEET, '    max-width: 100%;\n', ''),
      'nothing inside can exceed its width',
    );
  });

  it('refuses a literal colour', () => {
    refuses(
      (root) =>
        edit(
          root,
          STYLESHEET,
          '  color: styles.$color-text-secondary;\n}\n\n// ----',
          '  color: #6b7280;\n}\n\n// ----',
        ),
      'no literal colour or rgba',
    );
  });

  it('refuses an unprefixed class in the global Admin sheet', () => {
    refuses((root) => {
      const text = readAt(root, STYLESHEET);
      writeAt(root, STYLESHEET, `${text}\n.stage {\n  display: block;\n}\n`);
    }, 'every class is feature-prefixed');
  });
});

describe('contract and governance immutability', () => {
  it('refuses an added OpenAPI path', () => {
    refuses((root) => {
      const relative = 'packages/contracts/openapi/openapi.generated.json';
      const document = JSON.parse(readAt(root, relative));
      // A path that does not exist yet. The lifecycle routes already do —
      // `APP3-B04` published them — so adding one of those would change nothing.
      document.paths['/api/admin/design-templates/{templateId}/duplicate'] = { post: {} };
      writeAt(root, relative, JSON.stringify(document, null, 2));
    }, 'the published surface is unchanged');
  });

  it('refuses a new root script', () => {
    refuses((root) => {
      const manifest = JSON.parse(readAt(root, 'package.json'));
      manifest.scripts['check:app3-a03'] = 'node tools/check-app3-a03.mjs';
      writeAt(root, 'package.json', JSON.stringify(manifest, null, 2));
    }, 'the root script count is unchanged');
  });

  it('refuses an unregistered gate command', () => {
    refuses(
      (root) =>
        edit(root, COMMAND_INDEX, '| `CMD-CHECK-APP3-A03` |', '| `CMD-CHECK-APP3-A03-OLD` |'),
      'CMD-CHECK-APP3-A03 is registered',
    );
  });

  it('refuses an oversized production file', () => {
    refuses((root) => {
      const text = readAt(root, STAGE);
      writeAt(root, STAGE, `${text}\n${'// filler\n'.repeat(420)}`);
    }, 'within 400 lines');
  });
});
