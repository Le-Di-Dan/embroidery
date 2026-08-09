/**
 * Regressions for `tools/check-app3-b04a.mjs`.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the gate refuses it. A gate nobody has tried to break is
 * a gate nobody knows the strength of.
 *
 * The mutations worth reading twice are the ones that leave a **working**
 * endpoint. Keeping `archived_at` still answers `200` with a `DRAFT` body, and
 * only a query asking the column would ever notice. Adding `'PUBLISHED'` to the
 * source states makes restore quietly able to un-archive *and* republish without
 * GRD-T01. Running the publication guard makes restore refuse precisely the
 * template that needs rescuing. Moving the counter changes which retained
 * version comes back. None of the four is visible in a response body.
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
  REPO_ROOT,
  RESTORE_ROUTE,
  checkApp3B04A,
  checkAudit,
  checkBoundaries,
  checkClientBoundary,
  checkOperationIdStability,
  checkPredecessors,
  checkRequestContract,
  checkSurface,
  checkTransition,
  checkUseCase,
  read,
} from './check-app3-b04a.mjs';

// The four LC-24 transitions live in the lifecycle writes and their routes on
// the lifecycle controller — both split out of one file by this checkpoint. A
// mutation case must edit the file that actually holds the code it breaks.
const LIFECYCLE_WRITES = ADMIN_TEMPLATE_ADAPTER_FILES[2];
const LIFECYCLE_CONTROLLER = ADMIN_TEMPLATE_CONTROLLER_FILES[1];

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b04a-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-b04a.mjs',
    ...APP3_SURFACE_TOOL_FILES,
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
  const root = mkdtempSync(join(tmpdir(), 'app3-b04a-case-'));
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

describe('baseline', () => {
  it('accepts the delivered checkpoint', () => {
    assert.deepEqual(checkApp3B04A(rootWith()), []);
  });
});

describe('entry authority', () => {
  it('rejects a predecessor that is not accepted', () => {
    const phase = file('phase').replace(
      '\nAPP3-B04 = COMPLETE — REVIEW_ACCEPTED\n',
      '\nAPP3-B04 = COMPLETE — REVIEW_DELIVERED\n',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-B04 = COMPLETE — REVIEW_ACCEPTED'));
  });

  it('rejects the archive-marker ruling being erased', () => {
    const phase = file('phase').replace(/\nAPP3-B04A ARCHIVED_AT = CLEARED[^\n]*\n/, '\n');
    assert.ok(mentions(run(checkPredecessors, { phase }), 'clears the archive marker'));
  });

  it('accepts a recorded token that explains itself after an em dash', () => {
    // The status block uses `TOKEN = VALUE — prose` throughout; a rule matching
    // the whole line would refuse a record for being informative.
    assert.deepEqual(
      run(checkPredecessors, {
        phase: file('phase').replace(
          /\nAPP3-B04A EVENTS = NONE[^\n]*\n/,
          '\nAPP3-B04A EVENTS = NONE — no consumer exists\n',
        ),
      }),
      [],
    );
  });
});

describe('the published surface', () => {
  it('rejects a missing restore route', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[RESTORE_ROUTE];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'does not publish'));
  });

  it('rejects a renamed operation id', () => {
    const openapi = openapiWith((d) => {
      d.paths[RESTORE_ROUTE].post.operationId = 'adminDesignTemplate_unarchive';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'expected "adminDesignTemplate_restore"'));
  });

  it('rejects a second verb on the restore path', () => {
    const openapi = openapiWith((d) => {
      d.paths[RESTORE_ROUTE].delete = { operationId: 'adminDesignTemplate_purge' };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'carries post,delete'));
  });

  it('rejects a response that stops being the concrete detail projection', () => {
    const openapi = openapiWith((d) => {
      d.paths[RESTORE_ROUTE].post.responses['200'].content['application/json'].schema = {
        type: 'object',
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'does not answer the Admin detail'));
  });

  it('rejects a restore that takes no published body', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[RESTORE_ROUTE].post.requestBody;
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'takes no published restore body'));
  });

  it('rejects a surface count no accepted checkpoint explains', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/admin/design-templates/{templateId}/duplicate'] = { post: {} };
    });
    const failures = run(checkSurface, { openapi });
    assert.ok(mentions(failures, `paths, expected ${String(acceptedSurface(REPO_ROOT).paths)}`));
    assert.ok(
      mentions(
        failures,
        `admin design-template operations, expected ${String(
          acceptedAdminTemplateOperationCount(REPO_ROOT),
        )}`,
      ),
    );
  });

  it('rejects a second way out of ARCHIVED under another name', () => {
    for (const alias of ['unarchive', 'republish']) {
      const openapi = openapiWith((d) => {
        d.paths[`/api/admin/design-templates/{templateId}/${alias}`] = { post: {} };
      });
      assert.ok(mentions(run(checkSurface, { openapi }), `publishes a "${alias}" route`), alias);
    }
  });
});

describe('the client boundary', () => {
  it('rejects a restore response that generates as void', () => {
    const clientSchemas = file('clientSchemas').replace(
      /export type AdminDesignTemplateRestore200 = [^;]+;/,
      'export type AdminDesignTemplateRestore200 = void;',
    );
    assert.ok(mentions(run(checkClientBoundary, { clientSchemas }), 'generates as "void"'));
  });

  it('rejects the curated Admin boundary exporting restore before APP3-A04', () => {
    const curatedClient = `${file('curatedClient')}\nexport const adminDesignTemplateRestore = 1;\n`;
    assert.ok(mentions(run(checkClientBoundary, { curatedClient }), 'APP3-A04 owns lifecycle'));
  });
});

describe('the request contract', () => {
  it('rejects a blank-acceptable or unbounded reason', () => {
    const request = file('request').replace(
      /restoreDesignTemplateBodySchema = z\n  \.object\(\{\n    expectedCurrentVersion: z\.number\(\)\.int\(\)\.min\(0\),\n    reason: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(TEMPLATE_LIFECYCLE_REASON_MAX_LENGTH\),/,
      'restoreDesignTemplateBodySchema = z\n  .object({\n    expectedCurrentVersion: z.number().int().min(0),\n    reason: z.string().optional(),',
    );
    assert.ok(mentions(run(checkRequestContract, { request }), 'bounded non-blank reason'));
  });

  it('rejects a restore body that accepts a target state', () => {
    const request = file('request').replace(
      '    reason: z.string().trim().min(1).max(TEMPLATE_LIFECYCLE_REASON_MAX_LENGTH),\n  })\n  .strict();\n\nexport class RestoreDesignTemplateBody',
      '    reason: z.string().trim().min(1).max(TEMPLATE_LIFECYCLE_REASON_MAX_LENGTH),\n    status: z.string(),\n  })\n  .strict();\n\nexport class RestoreDesignTemplateBody',
    );
    assert.ok(mentions(run(checkRequestContract, { request }), 'server-owned "status"'));
  });

  it('rejects a restore DTO that is never registered for publication', () => {
    const request = file('request').replace('\n  RestoreDesignTemplateBody,\n);', '\n);');
    assert.ok(mentions(run(checkRequestContract, { request }), 'not registered for publication'));
  });
});

describe('the transition', () => {
  const writes = () => file(LIFECYCLE_WRITES);

  it('rejects widening the source beyond ARCHIVED', () => {
    // Still a working endpoint — and now able to "restore" a PUBLISHED template.
    const adapter = writes().replace("['ARCHIVED']", "['ARCHIVED', 'PUBLISHED']");
    assert.ok(
      mentions(run(checkTransition, { [LIFECYCLE_WRITES]: adapter }), 'constrain its source'),
    );
  });

  it('rejects a restore that keeps the archive marker', () => {
    // Answers 200 with a DRAFT body; only a query on the column would notice.
    const adapter = writes().replace('archivedAt: null,', '');
    assert.ok(mentions(run(checkTransition, { [LIFECYCLE_WRITES]: adapter }), 'clear archived_at'));
  });

  it('rejects a restore that lands anywhere but DRAFT', () => {
    const adapter = writes().replace(
      "await this.transition('restore', input, ['ARCHIVED'], {\n        status: 'DRAFT',",
      "await this.transition('restore', input, ['ARCHIVED'], {\n        status: 'PUBLISHED',",
    );
    assert.ok(mentions(run(checkTransition, { [LIFECYCLE_WRITES]: adapter }), 'land in DRAFT'));
  });

  it('rejects a restore that moves the counter or touches a stamp', () => {
    for (const [insert, needle] of [
      ['        currentVersion: 1,\n', 'moves current_version'],
      ['        publishedAt: null,\n', 'touches a publication stamp'],
      ['        productSideId: null,\n', 'repairs the scope'],
    ]) {
      // Anchored on the restore call itself. `unpublish` also sets
      // `status: 'DRAFT'` and comes first in the file, so the bare line would
      // have mutated that method and left restore — the subject — untouched.
      const anchor =
        "await this.transition('restore', input, ['ARCHIVED'], {\n        status: 'DRAFT',\n";
      assert.equal(writes().split(anchor).length - 1, 1, 'the restore anchor must be unique');
      const adapter = writes().replace(anchor, `${anchor}${insert}`);
      assert.ok(mentions(run(checkTransition, { [LIFECYCLE_WRITES]: adapter }), needle), needle);
    }
  });

  it('rejects dropping the source state or the token from the shared predicate', () => {
    const noState = writes().replace('inArray(designTemplates.status, [...from]),', '');
    assert.ok(
      mentions(run(checkTransition, { [LIFECYCLE_WRITES]: noState }), 'constrain the source state'),
    );
    const noToken = writes().replace(
      'eq(designTemplates.currentVersion, input.expectedCurrentVersion),',
      '',
    );
    assert.ok(mentions(run(checkTransition, { [LIFECYCLE_WRITES]: noToken }), 'compare-and-set'));
  });

  it('rejects a delete anywhere on the adapter', () => {
    const adapter = `${writes()}\nconst probe = (tx) => tx.delete(1);\n`;
    assert.ok(mentions(run(checkTransition, { [LIFECYCLE_WRITES]: adapter }), 'deletes rows'));
  });

  it('rejects dropping the restore seam from the port', () => {
    const repository = file('repository').replace(/\n  restore\(input[^;]+;/, '');
    assert.ok(mentions(run(checkTransition, { repository }), 'no restore seam'));
  });
});

describe('the use case', () => {
  it('rejects a restore that accepts a non-ARCHIVED source', () => {
    const useCase = file('useCase').replace("template.status !== 'ARCHIVED'", 'false');
    assert.ok(mentions(run(checkUseCase, { useCase }), 'refuse a non-ARCHIVED source'));
  });

  it('rejects a restore that runs the publication guard', () => {
    // Would refuse exactly the template that needs rescuing.
    const useCase = file('useCase').replace(
      '    const at = new Date();\n    await this.transactions.runInTransaction(async () => {\n      await this.guarded(() =>\n        this.templates.restore({',
      '    await this.publication.evaluate(template, undefined);\n    const at = new Date();\n    await this.transactions.runInTransaction(async () => {\n      await this.guarded(() =>\n        this.templates.restore({',
    );
    assert.ok(mentions(run(checkUseCase, { useCase }), 'runs the publication guard'));
  });

  it('rejects a restore that creates a version or cascades', () => {
    for (const [insert, needle] of [
      ['      await this.templates.saveDraftVersion({});\n', 'creates or publishes a version'],
      ['      await this.templates.ensureAssetAssociation({});\n', 'mutates a Template Asset'],
      ['      await this.sessions.clone();\n', 'reaches a Design Session'],
    ]) {
      // `transition: 'RESTORED'` is the only anchor unique to this method: the
      // other three transitions have the same audit call shape.
      const anchor = "        transition: 'RESTORED',";
      assert.equal(
        file('useCase').split(anchor).length - 1,
        1,
        'the restore anchor must be unique',
      );
      const useCase = file('useCase').replace(
        '      await this.audit.recordLifecycle({\n        templateId: template.id,\n' + anchor,
        `${insert}      await this.audit.recordLifecycle({\n        templateId: template.id,\n${anchor}`,
      );
      assert.ok(mentions(run(checkUseCase, { useCase }), needle), needle);
    }
  });

  it('rejects a restore that stops carrying the retained counter', () => {
    const useCase = file('useCase').replace(
      '        version: template.currentVersion,\n        // `IMP-D042` PO-03 requires a reason for archive and restore, and for\n        // neither of the other two.\n        reason: command.reason,',
      '        version: 1,\n        reason: command.reason,',
    );
    assert.ok(mentions(run(checkUseCase, { useCase }), 'carry the retained counter'));
  });
});

describe('the audit trail', () => {
  it('rejects a restore recorded as an unpublish', () => {
    const recorder = file('recorder').replace(
      "    RESTORED: 'design_template.restored',",
      "    RESTORED: 'design_template.unpublished',",
    );
    const failures = run(checkAudit, { recorder });
    assert.ok(mentions(failures, 'does not record design_template.restored'));
    assert.ok(mentions(failures, 'not four distinct codes'));
  });

  it('rejects an audit row written outside the transition', () => {
    const useCase = file('useCase').replace(
      /  async restore\(command: RestoreCommand\): Promise<TemplateDetailView> \{[\s\S]*?\n  \}\n/,
      [
        '  async restore(command: RestoreCommand): Promise<TemplateDetailView> {',
        '    const template = await this.require(command.templateId);',
        "    if (template.status !== 'ARCHIVED') { throw new Error('no'); }",
        '    const at = new Date();',
        '    await this.audit.recordLifecycle({',
        '      templateId: template.id,',
        "      transition: 'RESTORED',",
        "      from: 'ARCHIVED',",
        "      to: 'DRAFT',",
        '      version: template.currentVersion,',
        '      reason: command.reason,',
        '    });',
        '    await this.transactions.runInTransaction(async () => {',
        '      await this.guarded(() => this.templates.restore({ id: template.id, expectedCurrentVersion: command.expectedCurrentVersion, at }));',
        '    });',
        '    return this.project(template.id);',
        '  }',
        '',
      ].join('\n'),
    );
    assert.ok(mentions(run(checkAudit, { useCase }), 'not written inside the transition'));
  });
});

describe('operation-id stability across the controller split', () => {
  it('rejects dropping the explicit domain declaration', () => {
    const operationIds = file('operationIds').replace(
      "  AdminDesignTemplateLifecycleController: 'adminDesignTemplate',",
      '',
    );
    assert.ok(
      mentions(
        run(checkOperationIdStability, { operationIds }),
        'AdminDesignTemplateLifecycleController does not declare',
      ),
    );
  });

  it('rejects an accepted operation id silently disappearing', () => {
    // Exactly what the split did before the domain was declared.
    const openapi = openapiWith((d) => {
      d.paths['/api/admin/design-templates'].get.operationId = 'adminDesignTemplateAuthoring_list';
    });
    assert.ok(
      mentions(
        run(checkOperationIdStability, { openapi }),
        'adminDesignTemplate_list" is no longer',
      ),
    );
  });
});

describe('boundaries', () => {
  it('rejects a migration, a root script or an unregistered command', () => {
    const rootPackage = JSON.stringify({ scripts: { only: 'one' } });
    assert.ok(mentions(run(checkBoundaries, { rootPackage }), 'root scripts, expected 30'));
    const index = file('index').replace('CMD-CHECK-APP3-B04A', 'CMD-CHECK-SOMETHING-ELSE');
    assert.ok(mentions(run(checkBoundaries, { index }), 'does not index CMD-CHECK-APP3-B04A'));
  });

  it('rejects a surface file over the 400-line limit', () => {
    // The debt this checkpoint closed. Measured, never taken from the follow-up.
    const bloated = `${file(LIFECYCLE_WRITES)}\n${'// filler\n'.repeat(400)}`;
    assert.ok(
      mentions(run(checkBoundaries, { [LIFECYCLE_WRITES]: bloated }), 'over the 400-line limit'),
    );
  });

  it('rejects an unregistered controller', () => {
    const module = file('module').replace('AdminDesignTemplateLifecycleController]', ']');
    assert.ok(
      mentions(run(checkBoundaries, { module }), 'does not register AdminDesignTemplateLifecycle'),
    );
  });

  it('rejects an unguarded restore write', () => {
    const controller = file(LIFECYCLE_CONTROLLER).replace(
      "  @Post(':templateId/restore')\n  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)",
      "  @Post(':templateId/restore')",
    );
    assert.ok(
      mentions(
        run(checkBoundaries, { [LIFECYCLE_CONTROLLER]: controller }),
        'not a guarded Admin write',
      ),
    );
  });
});
