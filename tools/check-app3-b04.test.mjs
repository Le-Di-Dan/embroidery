/**
 * Regressions for the `APP3-B04` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a working system: a publish guard with one clause
 * quietly dropped, a `published_at` stamped unconditionally, an archive that
 * deletes, a transition that moves the version counter, and a restore route
 * appearing where `B04_LIFECYCLE_ROUTING_RULING` put it out of scope.
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
  ADMIN_TEMPLATE_ADAPTER_FILES,
  ADMIN_TEMPLATE_CONTROLLER_FILES,
  APP3_SURFACE_TOOL_FILES,
  acceptedAdminTemplateOperationCount,
  acceptedSurface,
  adminTemplateSurfaceFiles,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  OPERATIONS,
  REPO_ROOT,
  RESTORE_ROUTE,
  checkApp3B04,
  checkAudit,
  checkBoundaries,
  checkPublishGuard,
  checkRequestContract,
  checkSurface,
  checkTransitions,
  read,
} from './check-app3-b04.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
// The four LC-24 transitions and their shared compare-and-set live in the
// lifecycle writes, and their routes on the lifecycle controller — both split
// out of one file by `APP3-B04A`. A mutation case must edit the file that
// actually holds the code it breaks, or it writes a decoy the gate never reads
// and the case passes while proving nothing.
const LIFECYCLE_WRITES = ADMIN_TEMPLATE_ADAPTER_FILES[2];
const LIFECYCLE_CONTROLLER = ADMIN_TEMPLATE_CONTROLLER_FILES[1];

const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

/**
 * The phase document as it read before `APP3-B04A` delivered.
 *
 * Restore is ruled on in both directions, so the cases proving the *ban* have
 * to run in the world the ban describes. Rewriting the status line is how a
 * world-aware rule gets tested at all; pinning the old literal would only
 * prove the gate still remembers a world that has moved on.
 */
const preB04APhase = () =>
  file('phase').replace(/\nAPP3-B04A = COMPLETE[^\n]*\n/, '\nAPP3-B04A = READY — NOT STARTED\n');

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b04-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-b04.mjs',
    ...APP3_SURFACE_TOOL_FILES,
    // `APP3-B04A` split the Admin Template surface by responsibility, and a
    // harness copying only the files named in CANONICAL_FILES would run every
    // rule against a repo where the code under test is simply not present.
    ...adminTemplateSurfaceFiles(),
  ];
  for (const relative of [...Object.values(CANONICAL_FILES), ...extras]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-b04-case-'));
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

function openapiWith(mutate) {
  const document = JSON.parse(file('openapi'));
  mutate(document);
  return JSON.stringify(document);
}

describe('the accepted surface authority', () => {
  it('reports the B04 surface when B04 is the frontier', () => {
    const phase = ['# phase', '', '```text', 'APP3-B04 = COMPLETE — REVIEW_DELIVERED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 29);
    assert.equal(surface.operations, 34);
    assert.equal(surface.schemas, 76);
  });

  it('keeps B03A frozen at its own world', () => {
    const phase = ['# phase', '', '```text', 'APP3-B03A = COMPLETE — REVIEW_ACCEPTED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 26);
    assert.equal(surface.operations, 31);
    assert.equal(surface.schemas, 73);
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects losing a transition', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[Object.keys(OPERATIONS)[0]];
    });
    // The expected count comes from the shared surface authority, not a literal.
    // This gate runs in whatever world the phase records, and every checkpoint
    // after B04 legitimately moves that number — pinning `29` here made the case
    // stop describing its own subject the day `APP3-B05` shipped.
    const expected = acceptedSurface(REPO_ROOT).paths;
    assert.ok(mentions(run(checkSurface, { openapi }), `paths, expected ${String(expected)}`));
  });

  it("rejects APP3-B04A's restore appearing before that checkpoint delivered", () => {
    const openapi = openapiWith((d) => {
      d.paths[RESTORE_ROUTE] = { post: { operationId: 'adminDesignTemplate_restore' } };
    });
    const failures = run(checkSurface, { openapi, phase: preB04APhase() });
    assert.ok(mentions(failures, 'belongs to APP3-B04A'));
  });

  it('rejects restore going missing once APP3-B04A is delivered', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[RESTORE_ROUTE];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'delivered but'));
  });

  it('rejects restore published under an operation id that is not APP3-B04A own', () => {
    const openapi = openapiWith((d) => {
      d.paths[RESTORE_ROUTE].post.operationId = 'adminDesignTemplate_unarchive';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), "not APP3-B04A's"));
  });

  it('rejects an Admin Template operation no checkpoint claims', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/admin/design-templates/{templateId}/clone'] = {
        post: { operationId: 'adminDesignTemplate_clone' },
      };
    });
    assert.ok(
      mentions(
        run(checkSurface, { openapi }),
        `admin design-template operations, expected ${String(
          acceptedAdminTemplateOperationCount(REPO_ROOT),
        )}`,
      ),
    );
  });

  it('rejects a renamed operation id and a response that stops being concrete', () => {
    const renamed = openapiWith((d) => {
      d.paths[`/api/admin/design-templates/{templateId}/publish`].post.operationId = 'x';
    });
    assert.ok(mentions(run(checkSurface, { openapi: renamed }), 'adminDesignTemplate_publish'));

    const emptied = openapiWith((d) => {
      d.paths[`/api/admin/design-templates/{templateId}/archive`].post.responses['200'] = {
        description: 'ok',
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi: emptied }), 'Admin detail projection'));
  });
});

describe('the request contract', () => {
  it('accepts the delivered schemas', () => {
    assert.deepEqual(run(checkRequestContract), []);
  });

  it('rejects dropping the concurrency token', () => {
    const request = file('request').replaceAll(
      'expectedCurrentVersion: z.number().int().min(0)',
      'expectedCurrentVersion: z.number().optional()',
    );
    assert.ok(mentions(run(checkRequestContract, { request }), 'non-negative expected version'));
  });

  it('rejects a blank-acceptable archive reason', () => {
    const request = file('request').replace(
      'reason: z.string().trim().min(1).max(TEMPLATE_LIFECYCLE_REASON_MAX_LENGTH),',
      'reason: z.string().optional(),',
    );
    assert.ok(mentions(run(checkRequestContract, { request }), 'bounded non-blank reason'));
  });

  it('rejects a reason on publish or unpublish', () => {
    const request = file('request').replace(
      '  .object({ expectedCurrentVersion: z.number().int().min(0) })\n  .strict();',
      '  .object({ expectedCurrentVersion: z.number().int().min(0), reason: z.string() })\n  .strict();',
    );
    assert.ok(mentions(run(checkRequestContract, { request }), 'accepts a reason'));
  });

  it('rejects a generated response that degrades to void', () => {
    const clientSchemas = file('clientSchemas').replace(
      /export type AdminDesignTemplatePublish200 = [^;]+;/,
      'export type AdminDesignTemplatePublish200 = void;',
    );
    assert.ok(mentions(run(checkRequestContract, { clientSchemas }), 'generates as "void"'));
  });
});

describe('the publish guard', () => {
  it('accepts the delivered guard', () => {
    assert.deepEqual(run(checkPublishGuard), []);
  });

  for (const [call, clause] of [
    ['prepareDesignDocument(', 'document structure and complexity'],
    ['validatePlacementSnapshot(', 'placement agreement'],
    ['validateDocumentWithinEmbroideryArea(', 'containment in the embroidery area'],
    ['findPlacement(', 'the product/side/area chain'],
    ['contextFor(', 'template asset eligibility'],
  ]) {
    it(`rejects dropping ${clause} — GRD-T01 may not be reduced`, () => {
      const guard = file('guard').replaceAll(call, 'noop(');
      assert.ok(mentions(run(checkPublishGuard, { guard }), clause));
    });
  }

  it('rejects validating placement in the laxer historical mode', () => {
    const guard = file('guard').replace("'NEW_EDITING'", "'HISTORICAL_RENDER'");
    assert.ok(mentions(run(checkPublishGuard, { guard }), 'NEW_EDITING'));
  });

  it('rejects publishing against a retired Side or a foreign Area', () => {
    const retired = file('guard').replaceAll('retiredAt !== undefined', 'false');
    assert.ok(mentions(run(checkPublishGuard, { guard: retired }), 'retired Side'));

    const foreign = file('guard').replace('area.productSideId !== side.id', 'false');
    assert.ok(mentions(run(checkPublishGuard, { guard: foreign }), 'bind the Area to the Side'));
  });

  it('rejects a guard that writes — a guard that repairs is not a guard', () => {
    const guard = `${file('guard')}\nconst probe = (db) => db.update(1);\n`;
    assert.ok(mentions(run(checkPublishGuard, { guard }), 'writes'));
  });
});

describe('the transitions', () => {
  it('accepts the delivered adapter and use case', () => {
    assert.deepEqual(run(checkTransitions), []);
  });

  it('rejects dropping the source state or the token from the predicate', () => {
    const noState = file(LIFECYCLE_WRITES).replace(
      'inArray(designTemplates.status, [...from])',
      'undefined',
    );
    assert.ok(
      mentions(
        run(checkTransitions, { [LIFECYCLE_WRITES]: noState }),
        'constrain the source state',
      ),
    );

    // `replaceAll`, not `replace`: the same token predicate appears in
    // `APP3-B03A`'s `saveDraftVersion`, and replacing only the first would
    // delete that one and leave this rule's subject standing — the checker
    // reads the lifecycle `transition` body alone for exactly that reason.
    const noToken = file(LIFECYCLE_WRITES).replaceAll(
      'eq(designTemplates.currentVersion, input.expectedCurrentVersion),',
      '',
    );
    assert.ok(mentions(run(checkTransitions, { [LIFECYCLE_WRITES]: noToken }), 'compare-and-set'));
  });

  it('rejects stamping published_at unconditionally', () => {
    // The whole set-once rule is that predicate; without it a republication
    // silently rewrites the original timestamp.
    const adapter = file(LIFECYCLE_WRITES).replace(
      'isNull(designTemplateVersions.publishedAt),',
      '',
    );
    assert.ok(
      mentions(run(checkTransitions, { [LIFECYCLE_WRITES]: adapter }), 'IS NULL predicate'),
    );
  });

  it('rejects a publish that moves the version counter', () => {
    const adapter = file(LIFECYCLE_WRITES).replace(
      "        status: 'PUBLISHED',\n        updatedAt: input.at,",
      "        status: 'PUBLISHED',\n        currentVersion: 99,\n        updatedAt: input.at,",
    );
    assert.ok(
      mentions(run(checkTransitions, { [LIFECYCLE_WRITES]: adapter }), 'moves current_version'),
    );
  });

  it('rejects an unpublish that touches a version', () => {
    const adapter = file(LIFECYCLE_WRITES).replace(
      "      await this.transition('unpublish', input, ['PUBLISHED'], {",
      "      const probe = designTemplateVersions;\n      await this.transition('unpublish', input, ['PUBLISHED'], {",
    );
    assert.ok(
      mentions(run(checkTransitions, { [LIFECYCLE_WRITES]: adapter }), 'touches a version'),
    );
  });

  it('rejects deleting rows — archive is retention', () => {
    const adapter = `${file(LIFECYCLE_WRITES)}\nconst probe = (tx) => tx.delete(1);\n`;
    assert.ok(mentions(run(checkTransitions, { [LIFECYCLE_WRITES]: adapter }), 'deletes rows'));
  });

  it('rejects creating a version or an association during a transition', () => {
    const withVersion = file('useCase').replace(
      'await this.audit.recordLifecycle({',
      'await this.templates.saveDraftVersion({} as never);\n      await this.audit.recordLifecycle({',
    );
    assert.ok(mentions(run(checkTransitions, { useCase: withVersion }), 'creates a version'));

    const withAssociation = file('useCase').replace(
      'await this.audit.recordLifecycle({',
      'await this.templates.ensureAssetAssociation({} as never, "x");\n      await this.audit.recordLifecycle({',
    );
    assert.ok(mentions(run(checkTransitions, { useCase: withAssociation }), 'association'));
  });

  it('rejects implementing restore before APP3-B04A delivered it', () => {
    const failures = run(checkTransitions, { phase: preB04APhase() });
    assert.ok(mentions(failures, 'belongs to APP3-B04A'));
  });

  it('rejects restore disappearing once APP3-B04A is delivered', () => {
    const useCase = file('useCase').replace('async restore(', 'async notRestore(');
    assert.ok(mentions(run(checkTransitions, { useCase }), 'no restore is implemented'));
  });

  it('rejects a transition that leaves ARCHIVED for anything but DRAFT', () => {
    const useCase = file('useCase').replace(
      /from: 'ARCHIVED',(\s*)to: 'DRAFT',/,
      "from: 'ARCHIVED',$1to: 'PUBLISHED',",
    );
    assert.ok(mentions(run(checkTransitions, { useCase }), 'something other than DRAFT'));
  });

  it('rejects leaving a stale compare-and-set untranslated', () => {
    const useCase = file('useCase').replaceAll(
      'DESIGN_TEMPLATE_VERSION_CONFLICT',
      'SOMETHING_ELSE',
    );
    assert.ok(mentions(run(checkTransitions, { useCase }), 'not translated to the conflict'));
  });
});

describe('the audit trail', () => {
  it('accepts the delivered recorder', () => {
    assert.deepEqual(run(checkAudit), []);
  });

  it('rejects recording one transition as another', () => {
    const recorder = file('recorder').replace(
      "UNPUBLISHED: 'design_template.unpublished'",
      "UNPUBLISHED: 'design_template.published'",
    );
    assert.ok(mentions(run(checkAudit, { recorder }), 'design_template.unpublished'));
  });

  it('rejects an unbounded summary', () => {
    const recorder = file('recorder').replace(
      'summary: { from: input.from, to: input.to, version: input.version },',
      'summary: { from: input.from, to: input.to, version: input.version, designDocument: {} },',
    );
    const failures = run(checkAudit, { recorder });
    assert.ok(
      mentions(failures, 'bounded from/to/version') || mentions(failures, 'designDocument'),
    );
  });

  it('rejects dropping the archive reason', () => {
    const useCase = file('useCase').replace('reason: command.reason,', '');
    assert.ok(mentions(run(checkAudit, { useCase }), 'carry its reason'));
  });
});

describe('boundaries', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(run(checkBoundaries), []);
  });

  it('rejects a migration appearing', () => {
    const root = rootWith();
    writeFileSync(join(root, 'packages/database/migrations/0035_new.sql'), '');
    const failures = [];
    checkBoundaries(root, (m) => failures.push(m));
    assert.ok(mentions(failures, '35 migrations'));
  });

  it('rejects the restore route before APP3-B04A delivered it', () => {
    const failures = run(checkBoundaries, { phase: preB04APhase() });
    assert.ok(mentions(failures, 'APP3-B04A’s'));
  });

  it('rejects the restore route disappearing once APP3-B04A is delivered', () => {
    const controller = file(LIFECYCLE_CONTROLLER).replace(
      "@Post(':templateId/restore')",
      "@Post(':templateId/unrestore')",
    );
    assert.ok(
      mentions(
        run(checkBoundaries, { [LIFECYCLE_CONTROLLER]: controller }),
        'no controller declares the restore route',
      ),
    );
  });

  it('rejects an unguarded write', () => {
    const controller = file(LIFECYCLE_CONTROLLER).replace(
      "  @Post(':templateId/archive')\n  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)",
      "  @Post(':templateId/archive')",
    );
    // The expected number is derived, not pinned: `6` was right until
    // `APP3-B04A` published a seventh mutating operation, and a literal here
    // would fail on the count rather than on the missing guard it exists to catch.
    const expected = acceptedAdminTemplateOperationCount(REPO_ROOT) - 2;
    assert.ok(
      mentions(
        run(checkBoundaries, { [LIFECYCLE_CONTROLLER]: controller }),
        `guarded writes, expected ${String(expected)}`,
      ),
    );
  });

  it('rejects an unwired provider', () => {
    const module = file('module').replace('    DesignTemplateLifecycleUseCase,\n', '');
    assert.ok(mentions(run(checkBoundaries, { module }), 'does not provide'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, predecessors and all', () => {
    assert.deepEqual(checkApp3B04(REPO_ROOT), []);
  });
});
