/**
 * Regressions for `tools/check-app3-b03b.mjs`.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the gate refuses it. A gate nobody has tried to break is
 * a gate nobody knows the strength of.
 *
 * The mutations worth reading twice are the ones that leave a **working**
 * endpoint. Dropping one `isNull` clause turns a one-time assignment into a
 * silent rescope that passes every functional test — and quietly invalidates the
 * placement snapshot inside every version already saved. A read-then-update
 * answers `200` for both racers. An outbox append announces work nobody does. A
 * curated-client export would make this backend-only checkpoint change the Admin
 * frontend. None of the four is visible in a response body.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { APP3_SURFACE_TOOL_FILES, acceptedSurface } from './app3-accepted-surface.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'tools/check-app3-b03b.mjs';

/** Everything the gate reads. */
const COPIED = [
  GATE,
  // The gate now consults the shared APP3 surface authority, which is three
  // modules; copying only the entry point makes every case die on
  // ERR_MODULE_NOT_FOUND rather than on the rule it is testing.
  ...APP3_SURFACE_TOOL_FILES,
  'package.json',
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  'docs/implementation/SCOPED_COMMAND_INDEX.md',
  'packages/contracts/openapi/openapi.generated.json',
  'packages/api-client/src/generated/embroidery-api.ts',
  'packages/api-client/src/index.ts',
  'packages/database/migrations',
  'packages/database/src/schema',
  'apps/api/src/modules/design',
  // The consumer rules scan the Admin features: `APP3-A03-C1` made this gate
  // world-aware, and after that correction it asserts *which* module reaches
  // the operation, not merely that none does.
  'apps/admin/src/features',
];

const PHASE_PLAN = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
const COMMAND_INDEX = 'docs/implementation/SCOPED_COMMAND_INDEX.md';
const OPENAPI = 'packages/contracts/openapi/openapi.generated.json';
const CURATED_CLIENT = 'packages/api-client/src/index.ts';
const DESIGN = 'apps/api/src/modules/design';
const USE_CASE = `${DESIGN}/application/assign-template-scope.use-case.ts`;
const AUDIT = `${DESIGN}/application/design-template-audit.recorder.ts`;
// `APP3-B04A` split both surfaces by responsibility. A mutation case must break
// the file that actually holds the code — an anchor in a file the gate no longer
// reads would make `edit()` throw, or worse, silently prove nothing.
const REPOSITORY = `${DESIGN}/infrastructure/persistence/design-template-authoring.writes.ts`;
const CONTROLLER = `${DESIGN}/presentation/admin-design-template-authoring.controller.ts`;
const ERRORS = `${DESIGN}/domain/design-template-draft.errors.ts`;
const INTEGRATION = `${DESIGN}/tests/integration/design-template-scope-assign.integration.spec.ts`;

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let pristine;
function baseRoot() {
  if (pristine !== undefined) return pristine;
  pristine = mkdtempSync(join(tmpdir(), 'app3-b03b-base-'));
  temporaries.push(pristine);
  for (const relative of COPIED) {
    const target = join(pristine, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, relative), target, { recursive: true });
  }
  return pristine;
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-b03b-'));
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
  it('refuses an unaccepted B03A, whose version semantics this guards against', () => {
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

  it('refuses the A03 blocker being erased once the correction delivered', () => {
    // The rule is world-aware: before `APP3-A03-C1` the correction had to stay
    // recorded, and after it the blocker must be recorded as *closed by that
    // correction*. Either way the phase may not simply stop mentioning it — a
    // blocker nobody records is a blocker nobody re-checks.
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          '\nA03_REVIEW_BLOCKER = CLOSED_BY_APP3-A03-C1',
          '\nA03_REVIEW_BLOCKER_NOTE = tidied away',
        ),
      'the A03 blocker is recorded in the state the phase is actually in',
    );
  });
});

describe('the one-time semantics', () => {
  it('refuses a dropped isNull clause, which silently enables rescoping', () => {
    // The endpoint still works. Every functional test still passes. And a
    // Template that already has versions can now be rebound to a different
    // Side, invalidating the immutable placement snapshot inside each of them.
    refuses(
      (root) => edit(root, REPOSITORY, '            isNull(designTemplates.productId),\n', ''),
      'the predicate pins',
    );
  });

  it('refuses a dropped version-rows clause', () => {
    refuses(
      (root) =>
        edit(
          root,
          REPOSITORY,
          `            notExists(
              tx
                .select({ one: sql\`1\` })
                .from(designTemplateVersions)
                .where(eq(designTemplateVersions.designTemplateId, input.id)),
            ),\n`,
          '',
        ),
      'the predicate pins',
    );
  });

  it('refuses a dropped DRAFT clause', () => {
    // Anchored together with the counter clause: `saveDraftVersion` guards on
    // DRAFT too, so the line alone is not unique to this predicate.
    refuses(
      (root) =>
        edit(
          root,
          REPOSITORY,
          "            eq(designTemplates.status, 'DRAFT'),\n            eq(designTemplates.currentVersion, 0),",
          '            eq(designTemplates.currentVersion, 0),',
        ),
      'the predicate pins',
    );
  });

  it('refuses a rescope method appearing on the adapter', () => {
    refuses((root) => {
      const text = readAt(root, REPOSITORY);
      writeAt(root, REPOSITORY, `${text}\nexport function rescope() {}\n`);
    }, 'no clear or rescope method exists on the adapter');
  });

  it('refuses a PATCH alias on a design-template path', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, OPENAPI));
      document.paths['/api/admin/design-templates/{templateId}/scope'].patch = { operationId: 'x' };
      writeAt(root, OPENAPI, JSON.stringify(document, null, 2));
    }, 'no design-template path accepts PATCH');
  });

  it('refuses a rescope route being published', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, OPENAPI));
      document.paths['/api/admin/design-templates/{templateId}/rescope'] = { put: {} };
      writeAt(root, OPENAPI, JSON.stringify(document, null, 2));
    }, 'no rescope route exists');
  });
});

describe('the contract', () => {
  it('refuses an expected-version token added to the body', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, OPENAPI));
      document.components.schemas['AssignDesignTemplateScopeBody'].properties[
        'expectedCurrentVersion'
      ] = { type: 'integer' };
      writeAt(root, OPENAPI, JSON.stringify(document, null, 2));
    }, 'no expected-version token');
  });

  it('refuses a body that stops requiring the complete triple', () => {
    refuses((root) => {
      const document = JSON.parse(readAt(root, OPENAPI));
      document.components.schemas['AssignDesignTemplateScopeBody'].required = ['productId'];
      writeAt(root, OPENAPI, JSON.stringify(document, null, 2));
    }, 'exactly the complete triple');
  });

  it('refuses a surface that grew beyond the one operation', () => {
    refuses(
      (root) => {
        const document = JSON.parse(readAt(root, OPENAPI));
        document.paths['/api/admin/design-templates/{templateId}/duplicate'] = { post: {} };
        writeAt(root, OPENAPI, JSON.stringify(document, null, 2));
        // The message names the accepted world, which moves as later checkpoints
        // legitimately publish. `33` was right at B03B and wrong from B04A on —
        // the assertion is that a *grown* surface is caught, not that the number
        // never changes.
      },
      `the surface is ${String(acceptedSurface(REPO_ROOT).paths)} paths`,
    );
  });
});

describe('what the use case must not do', () => {
  it('refuses an outbox append', () => {
    refuses((root) => {
      const text = readAt(root, USE_CASE);
      writeAt(
        root,
        USE_CASE,
        text.replace('const templateId', 'const outbox = 1;\nconst templateId'),
      );
    }, 'it does not reach');
  });

  it('refuses a version being created', () => {
    refuses(
      (root) =>
        edit(
          root,
          USE_CASE,
          'const existing = await this.templates.findById(templateId);',
          'const existing = await this.templates.saveDraftVersion(templateId);',
        ),
      'it does not reach',
    );
  });

  it('refuses a Product-publication predicate', () => {
    // Publication readiness is GRD-T01 and belongs to APP3-B04. A draft scoped
    // to an unpublished Product is an ordinary draft.
    refuses((root) => {
      const text = readAt(root, USE_CASE);
      writeAt(
        root,
        USE_CASE,
        text.replace('const templateId', 'const readiness = 1;\nconst templateId'),
      );
    }, 'no Product-publication predicate');
  });

  it('refuses a second Catalog query', () => {
    refuses((root) => {
      const text = readAt(root, USE_CASE);
      writeAt(root, USE_CASE, `import { drizzle } from 'drizzle-orm';\n${text}`);
    }, 'no second Catalog query or SQL');
  });

  it('refuses the scope and the Audit row drifting out of one transaction', () => {
    refuses(
      (root) =>
        edit(
          root,
          USE_CASE,
          `      await this.audit.recordScopeAssigned({
        templateId: assigned.id,
        productId: scope.productId,
        productSideId: scope.productSideId,
        embroideryAreaId: scope.embroideryAreaId,
      });
      return assigned;`,
          '      return assigned;',
        ),
      'the scope and the Audit row are one transaction',
    );
  });

  it('refuses an untranslated persistence guard', () => {
    refuses(
      (root) =>
        edit(
          root,
          USE_CASE,
          "  return error.code === 'STALE_WRITE'\n    ? designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE')\n    : error;",
          '  return error;',
        ),
      'the persistence guard is translated',
    );
  });
});

describe('errors, audit and boundaries', () => {
  it('refuses the not-assignable code being mapped to something other than 409', () => {
    refuses(
      (root) =>
        edit(
          root,
          ERRORS,
          "    case 'DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE':\n      return new ConflictException(error.message);",
          "    case 'DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE':\n      return new NotFoundException(error.message);",
        ),
      'the not-assignable code exists and is a conflict',
    );
  });

  it('refuses an audit summary that does not say what was assigned', () => {
    refuses(
      (root) =>
        edit(
          root,
          AUDIT,
          "        from: 'UNSCOPED',\n        productId: input.productId,\n        productSideId: input.productSideId,\n        embroideryAreaId: input.embroideryAreaId,",
          "        from: 'UNSCOPED',",
        ),
      'the summary names the source state and the exact triple',
    );
  });

  it('refuses the operation being withdrawn from its delivered consumer', () => {
    // Before `APP3-A03-C1` this rule ran the other way: an export here would
    // have been a frontend change B03B was forbidden to make. Now the export is
    // the point — a published operation with no consumer is an invitation
    // nobody accepted — so removing it is what the gate refuses.
    refuses(
      (root) => edit(root, CURATED_CLIENT, '  adminDesignTemplateAssignScope,\n', ''),
      'the curated boundary exposes it for its APP3-A03-C1 consumer',
    );
  });

  it('refuses a second Admin module reaching the scope write', () => {
    refuses((root) => {
      const table = 'apps/admin/src/features/design-templates/components/design-template-table.tsx';
      const text = readAt(root, table);
      writeAt(
        root,
        table,
        `import { adminDesignTemplateAssignScope } from '@embroidery/api-client';\n${text}`,
      );
    }, 'exactly one Admin module consumes it');
  });

  it('refuses a controller that decides instead of delegating', () => {
    refuses(
      (root) =>
        edit(
          root,
          CONTROLLER,
          '      this.scopeAssignment.assign({',
          '      this.templates.assignInitialScope({',
        ),
      'it delegates rather than deciding',
    );
  });
});

describe('proof and governance', () => {
  it('refuses an integration that stops proving the race', () => {
    refuses(
      (root) =>
        edit(
          root,
          INTEGRATION,
          'expect(statuses).toEqual([200, 409]);',
          'expect(true).toBe(true);',
        ),
      'the race is proved concurrently',
    );
  });

  it('refuses a new migration', () => {
    refuses((root) => {
      writeAt(root, 'packages/database/migrations/0035_scope_history.sql', 'SELECT 1;');
    }, 'no migration was added');
  });

  it('refuses a new root script', () => {
    refuses((root) => {
      const manifest = JSON.parse(readAt(root, 'package.json'));
      manifest.scripts['check:app3-b03b'] = 'node tools/check-app3-b03b.mjs';
      writeAt(root, 'package.json', JSON.stringify(manifest, null, 2));
    }, 'the root script count is unchanged');
  });

  it('refuses an unregistered gate command', () => {
    refuses(
      (root) =>
        edit(root, COMMAND_INDEX, '| `CMD-CHECK-APP3-B03B` |', '| `CMD-CHECK-APP3-B03B-OLD` |'),
      'CMD-CHECK-APP3-B03B is registered',
    );
  });

  it('refuses a follow-up that claims the whole problem is solved', () => {
    refuses(
      (root) =>
        edit(
          root,
          PHASE_PLAN,
          'FU-APP3-TEMPLATE-SCOPE-EDIT-01 = CLOSED_FOR_CURRENT_APP3_SCOPE',
          'FU-APP3-TEMPLATE-SCOPE-EDIT-01 = RESOLVED — general rescope delivered',
        ),
      'the scope follow-up matches the delivered world',
    );
  });

  it('refuses the pre-existing file-size overrun going unrecorded', () => {
    refuses(
      (root) =>
        edit(root, PHASE_PLAN, 'FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01', 'FU-APP3-SOMETHING-ELSE-01'),
      'the pre-existing file-size overrun is recorded',
    );
  });
});
