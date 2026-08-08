/**
 * Regressions for the `APP3-B03` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a working system: a create that also writes version 1,
 * a fourth operation, a keyset page that fetches exactly `limit`, a projection
 * that reports an absent version as version 0. All four ship green, all four are
 * defects, and the last two were real — the over-fetch bug was caught by the live
 * suite during delivery, which is why it has a case here.
 *
 * The sub-checks run against a temp root; the whole gate is proved once against
 * the real repository in the last block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { acceptedAdminTemplateOperationCount, acceptedSurface } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  COLLECTION_ROUTE,
  ITEM_ROUTE,
  REPO_ROOT,
  checkApp3B03,
  checkAuthorization,
  checkCreateSemantics,
  checkResponseContract,
  checkSurface,
  checkVersionHonesty,
  read,
} from './check-app3-b03.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b03-'));
  temporaries.push(base);
  const extras = ['tools/check-app3-b03.mjs', 'tools/app3-accepted-surface.mjs'];
  for (const relative of [...Object.values(CANONICAL_FILES), ...extras]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  // `checkBoundaries` counts migration files; copy the directory listing shape
  // rather than the contents, which the gate never reads.
  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-b03-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const relative = CANONICAL_FILES[key] ?? key;
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** One check against a mutated root. */
function run(check, overrides = {}) {
  const failures = [];
  check(rootWith(overrides), (message) => failures.push(message));
  return failures;
}

/** The generated document with one mutation applied. */
function openapiWith(mutate) {
  const document = JSON.parse(file('openapi'));
  mutate(document);
  return JSON.stringify(document);
}

describe('the accepted surface authority', () => {
  it('reports the B03 surface when B03 is the frontier', () => {
    // Pinned against a phase where B03 *is* the newest delivered checkpoint,
    // not against the real repository: what B03 rules is its own world, and
    // asserting the live numbers is what made the B07 equivalent stale the day
    // a later checkpoint shipped a route.
    const phase = ['# phase', '', '```text', 'APP3-B03 = COMPLETE — REVIEW_DELIVERED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 25);
    assert.equal(surface.operations, 30);
    assert.equal(surface.schemas, 72);
    // B03 adds no Session route; the two counts are independent on purpose.
    assert.equal(surface.designSessionPaths, 4);
  });

  it('derives from the accepted status, never by counting the artifact', () => {
    assert.ok(!/openapi\.generated\.json/.test(file('tools/app3-accepted-surface.mjs')));
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects a missing B03 operation', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[ITEM_ROUTE];
    });
    // Derived, not pinned at 25: `APP3-B03A` legitimately moved the accepted
    // surface, and a literal here would fail on a correct repository.
    const expected = acceptedSurface(REPO_ROOT).paths;
    assert.ok(mentions(run(checkSurface, { openapi }), `paths, expected ${String(expected)}`));
  });

  it('rejects one more Admin Template operation than the phase allows', () => {
    const openapi = openapiWith((d) => {
      d.paths[`${COLLECTION_ROUTE}/import`] = {
        post: { operationId: 'adminDesignTemplate_import' },
      };
    });
    // Three before `APP3-B03A`, four after, seven once `APP3-B04` lands — and
    // never one more than the accepted world explains, whichever world that is.
    const allowed = acceptedAdminTemplateOperationCount(REPO_ROOT);
    assert.ok(
      mentions(
        run(checkSurface, { openapi }),
        `admin design-template operations, expected ${String(allowed)}`,
      ),
    );
  });

  it("rejects APP3-B03A's save appearing while B03A is unstarted", () => {
    // The mode-aware half of the rule. The delivered world is asserted by the
    // suite's first case, which accepts the real artifact; this one rebuilds the
    // *undelivered* world and proves the save is still refused there.
    const phase = file('phase').replace(
      /\nAPP3-B03A = COMPLETE[^\n]*\n/,
      '\nAPP3-B03A = READY — NOT STARTED\n',
    );
    const failures = run(checkSurface, { phase });
    assert.ok(mentions(failures, 'belongs to APP3-B03A'), failures.join('\n'));
  });

  it("rejects APP3-B04's lifecycle routes while B04 is unstarted", () => {
    // Same shape as the B03A case above, for the same reason: publish now exists
    // in the real artifact, so *adding* it proves nothing. This rebuilds the
    // undelivered world and proves the three routes are still refused there.
    const phase = file('phase').replace(
      /\nAPP3-B04 = COMPLETE[^\n]*\n/,
      '\nAPP3-B04 = READY — NOT STARTED\n',
    );
    const failures = run(checkSurface, { phase });
    assert.ok(mentions(failures, 'belongs to APP3-B04'), failures.join('\n'));
  });

  it('rejects a lifecycle route going missing once B04 is accepted', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[`${ITEM_ROUTE}/publish`];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'APP3-B04 is delivered but'));
  });

  it('rejects a renamed operation id', () => {
    const openapi = openapiWith((d) => {
      d.paths[COLLECTION_ROUTE].post.operationId = 'designTemplate_create';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'expected "adminDesignTemplate_create"'));
  });
});

describe('the response contract', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkResponseContract), []);
  });

  it('rejects a success that stops publishing a schema', () => {
    const openapi = openapiWith((d) => {
      d.paths[ITEM_ROUTE].get.responses['200'] = { description: 'The design template.' };
    });
    assert.ok(mentions(run(checkResponseContract, { openapi }), 'publishes no success schema'));
  });

  it('rejects a component that leaks a storage identity', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas['AdminDesignTemplateDetailResponse'].properties['storageKey'] = {
        type: 'string',
      };
    });
    assert.ok(mentions(run(checkResponseContract, { openapi }), 'publishes "storageKey"'));
  });

  it('rejects a generated client response that degrades to void', () => {
    const clientSchemas = file('clientSchemas').replace(
      /export type AdminDesignTemplateDetail200 = [^;]+;/,
      'export type AdminDesignTemplateDetail200 = void;',
    );
    assert.ok(mentions(run(checkResponseContract, { clientSchemas }), 'generates as "void"'));
  });
});

describe('header-only create', () => {
  it('accepts the delivered implementation', () => {
    assert.deepEqual(run(checkCreateSemantics), []);
  });

  it('rejects a create that also writes a version', () => {
    // The mutation that most plausibly ships: it looks tidier and it silently
    // takes APP3-B03A's scope.
    const service = file('service').replace(
      'await this.audit.recordCreated(',
      'await this.templates.publishVersion({} as never);\n      await this.audit.recordCreated(',
    );
    assert.ok(mentions(run(checkCreateSemantics, { service }), 'publishes a Template version'));
  });

  it('rejects a create that attaches an asset', () => {
    const service = file('service').replace(
      'return created;',
      'await this.templates.attachAsset(created.id, "x");\n      return created;',
    );
    assert.ok(mentions(run(checkCreateSemantics, { service }), 'mutates a Template Asset'));
  });

  it('rejects producing the normalization event here', () => {
    const eventType = ['asset', 'normalization', 'requested'].join('.');
    const service = `${file('service')}\nconst probe = '${eventType}';\n`;
    assert.ok(mentions(run(checkCreateSemantics, { service }), 'names the normalization event'));
  });

  it('rejects a create body that accepts a document', () => {
    const request = file('request').replace(
      'name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX_LENGTH),',
      'name: z.string(),\n    designDocument: z.record(z.unknown()).optional(),',
    );
    assert.ok(mentions(run(checkCreateSemantics, { request }), 'accepts a Design Document'));
  });

  it('rejects dropping strict unknown-field refusal', () => {
    const request = file('request').replaceAll('.strict()', '');
    assert.ok(mentions(run(checkCreateSemantics, { request }), 'unknown fields'));
  });

  it('accepts the list filter keeping its status field', () => {
    // The list query legitimately names `status`; only the create body may not.
    // Without this case the rule could be tightened into one that fails a
    // correct implementation.
    assert.ok(!mentions(run(checkCreateSemantics), 'caller-chosen status'));
  });

  it('rejects a create that starts anywhere but DRAFT with zero versions', () => {
    for (const mutation of [
      ['status: ', "status: 'PUBLISHED',\n          _status: '"],
      ['currentVersion: 0', 'currentVersion: 1'],
    ]) {
      const adapter = file('adapter').replace(mutation[0], mutation[1]);
      assert.ok(
        mentions(run(checkCreateSemantics, { adapter }), 'DRAFT header with zero versions'),
        mutation[0],
      );
    }
  });

  it('rejects a keyset page that fetches exactly the limit', () => {
    // The real defect this checkpoint hit: `hasNext` is then false on every full
    // page and the list silently truncates after one page.
    const adapter = file('adapter').replace('.limit(input.limit + 1)', '.limit(input.limit)');
    assert.ok(mentions(run(checkCreateSemantics, { adapter }), 'over-fetch by one'));
  });

  it('rejects offset paging', () => {
    const adapter = file('adapter').replace(
      '.limit(input.limit + 1)',
      '.offset(0)\n        .limit(input.limit + 1)',
    );
    assert.ok(mentions(run(checkCreateSemantics, { adapter }), 'pages by offset'));
  });
});

describe('version honesty', () => {
  it('accepts the delivered projection', () => {
    assert.deepEqual(run(checkVersionHonesty), []);
  });

  it('rejects fabricating a version 0', () => {
    const projection = file('projection').replace(
      '...(version === undefined ? {} : { currentVersion: toVersionView(version) }),',
      'currentVersion: version === undefined ? { version: 0 } : toVersionView(version),',
    );
    assert.ok(mentions(run(checkVersionHonesty, { projection }), 'absent field'));
  });

  it('rejects resolving a version for every list row', () => {
    const query = file('query').replace(
      'const page = buildPage(',
      'await this.templates.findLatestVersion(rows[0].id);\n    const page = buildPage(',
    );
    assert.ok(mentions(run(checkVersionHonesty, { query }), 'resolves a version per row'));
  });
});

describe('authorization', () => {
  it('accepts the delivered wiring', () => {
    assert.deepEqual(run(checkAuthorization), []);
  });

  it('rejects dropping the Admin guard', () => {
    const controller = file('controller').replace('@UseGuards(AuthenticatedAdminGuard)\n', '');
    assert.ok(mentions(run(checkAuthorization, { controller }), 'Admin guard is not applied'));
  });

  it('rejects mixing anonymous Session auth into the Admin surface', () => {
    const controller = `${file('controller')}\nimport { DesignSessionGuard } from './guards/design-session.guard';\n`;
    assert.ok(mentions(run(checkAuthorization, { controller }), 'anonymous Session auth'));
  });

  it('rejects a mutating verb no APP3 checkpoint owns', () => {
    const controller = file('controller').replace(
      '  @Post()',
      "  @Patch(':templateId')\n  @Post()",
    );
    assert.ok(mentions(run(checkAuthorization, { controller }), 'no APP3 checkpoint owns'));
  });

  it('rejects the save verb disappearing while APP3-B03A is delivered', () => {
    const controller = file('controller').replaceAll("@Put(':templateId/document')", '@Post()');
    assert.ok(
      mentions(
        run(checkAuthorization, { controller }),
        "does not match APP3-B03A's delivered state",
      ),
    );
  });

  it('rejects a local envelope helper', () => {
    const controller = `${file('controller')}\nfunction envelopeOf(model) { return model; }\n`;
    assert.ok(mentions(run(checkAuthorization, { controller }), 'local envelope helper'));
  });

  it('rejects an unregistered module', () => {
    const appModule = 'export class AppModule {}\n';
    assert.ok(mentions(run(checkAuthorization, { appModule }), 'is not composed'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, predecessors and all', () => {
    assert.deepEqual(checkApp3B03(REPO_ROOT), []);
  });
});
