/**
 * Regressions for `tools/check-app3-a04.mjs`.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the gate refuses it. A gate nobody has tried to break is
 * a gate nobody knows the strength of.
 *
 * The mutations worth reading twice leave a **working** screen. A readiness row
 * that renders `READY` because nothing evaluated it still publishes fine — until
 * the day the server refuses and the operator has seven ticks on screen. A
 * conflict that replays still works, until it lands on a Template someone else
 * archived. A `targetStatus` in a body is accepted by the server today and is
 * the field that would let a client ask for `ARCHIVED → PUBLISHED` tomorrow.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { APP3_SURFACE_TOOL_FILES } from './app3-accepted-surface.mjs';
import { A04_DESIGN_ROWS, READINESS_CONDITIONS } from './check-app3-a04-authority.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkActionMatrix,
  checkApp3A04,
  checkBoundaries,
  checkCacheBehaviour,
  checkClientBoundary,
  checkCommandBodies,
  checkContractImmutability,
  checkCopyRulings,
  checkPredecessors,
  checkRoute,
  read,
} from './check-app3-a04.mjs';
import { checkDesignApproval, checkReadinessConcepts } from './check-app3-a04-authority.mjs';

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

const FEATURE = 'apps/admin/src/features/design-template-lifecycle';
const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway repository.
 *
 * Whole directories are copied rather than the files named in
 * `CANONICAL_FILES`: several rules walk a tree (every source in the feature,
 * every route file, the generated client) and a harness that copied only the
 * named files would run them against a repo where the code under test is simply
 * not present — passing for the wrong reason.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-a04-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-a04.mjs',
    'tools/check-app3-a04-authority.mjs',
    ...APP3_SURFACE_TOOL_FILES,
  ]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target, { recursive: true });
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  for (const dir of [
    FEATURE,
    'apps/admin/src/app',
    'apps/admin/src/features/design-template-editor',
    'apps/admin/src/features/design-templates',
    'packages/api-client/src/generated',
  ]) {
    cpSync(join(REPO_ROOT, dir), join(base, dir), { recursive: true });
  }
  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-a04-case-'));
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
  const root = rootWith(overrides);
  if (check === checkDesignApproval || check === checkReadinessConcepts) {
    check(
      root,
      (message) => failures.push(message),
      check === checkDesignApproval
        ? (dir, key) => read(dir, key)
        : (dir, key) => stripComments(read(dir, key) ?? ''),
      CANONICAL_FILES,
    );
    return failures;
  }
  check(root, (message) => failures.push(message));
  return failures;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('baseline', () => {
  it('accepts the delivered checkpoint', () => {
    assert.deepEqual(checkApp3A04(rootWith()), []);
  });
});

describe('entry authority', () => {
  it('rejects an unaccepted backend predecessor', () => {
    const phase = file('phase').replace(
      '\nAPP3-B04A = COMPLETE — REVIEW_ACCEPTED\n',
      '\nAPP3-B04A = COMPLETE — REVIEW_DELIVERED\n',
    );
    assert.ok(
      mentions(run(checkPredecessors, { phase }), 'APP3-B04A = COMPLETE — REVIEW_ACCEPTED'),
    );
  });
});

describe('the design approval', () => {
  it('rejects an A04 row left unapproved', () => {
    const registry = file('registry').replace(
      new RegExp(`(\\| ${A04_DESIGN_ROWS[0]} .*?)APPROVED_FOR_IMPLEMENTATION`),
      '$1REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'not APPROVED_FOR_IMPLEMENTATION'));
  });

  it('rejects approving a row beyond the five — a Studio row above all', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-SHELL-DESKTOP-DEFAULT .*?)\| — \| — \|/,
      '$1| — | APP3-A04 §0 operator review |',
    );
    const failures = run(checkDesignApproval, { registry });
    assert.ok(mentions(failures, 'rows approved under A04, expected 5'));
    assert.ok(mentions(failures, 'FIG-STUDIO-SHELL-DESKTOP-DEFAULT'));
  });
});

describe('the route', () => {
  it('rejects a fourth Design Template route', () => {
    const root = rootWith();
    const extra = join(root, 'apps/admin/src/app/(protected)/design-templates/legacy/page.tsx');
    mkdirSync(dirname(extra), { recursive: true });
    writeFileSync(extra, 'export default function Legacy() { return null; }', 'utf8');
    const failures = [];
    checkRoute(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'Design Template routes, expected 3'));
  });

  it('rejects an editor that navigates outside the guard', () => {
    const editorScreen = file('editorScreen').replace(
      /guard\.requestNavigation\(\(\) => \{\s*router\.push\(adminDesignTemplatePublicationRoute\(templateId\)\);\s*\}\);/,
      'router.push(adminDesignTemplatePublicationRoute(templateId));',
    );
    assert.ok(
      mentions(run(checkRoute, { editorScreen }), 'does not route to A04 through the navigation'),
    );
  });
});

describe('the client boundary', () => {
  it('rejects a lifecycle operation withheld from the curated client', () => {
    const curatedClient = file('curatedClient').replace('  adminDesignTemplateRestore,\n', '');
    assert.ok(
      mentions(
        run(checkClientBoundary, { curatedClient }),
        'does not export adminDesignTemplateRestore',
      ),
    );
  });

  it('rejects the list or the editor invoking a lifecycle operation', () => {
    const root = rootWith();
    const listFile = join(root, 'apps/admin/src/features/design-templates/model/probe.ts');
    writeFileSync(listFile, 'export const probe = adminDesignTemplateArchive;\n', 'utf8');
    const failures = [];
    checkClientBoundary(root, (message) => failures.push(message));
    assert.ok(mentions(failures, "invokes adminDesignTemplateArchive, which is APP3-A04's"));
  });
});

describe('the action matrix', () => {
  it('rejects offering a transition LC-24 does not recognise', () => {
    const actionsModel = file('actionsModel').replace(
      "ARCHIVED: Object.freeze(['restore'] as const),",
      "ARCHIVED: Object.freeze(['restore', 'publish'] as const),",
    );
    const failures = run(checkActionMatrix, { actionsModel });
    assert.ok(mentions(failures, 'ARCHIVED does not offer exactly its LC-24 actions'));
    assert.ok(mentions(failures, 'offers a publish from ARCHIVED'));
  });

  it('rejects dropping the reason requirement', () => {
    const actionsModel = file('actionsModel').replace(
      /REASONED_ACTIONS: readonly LifecycleAction\[\] = Object\.freeze\(\[[\s\S]*?\] as const\);/,
      'REASONED_ACTIONS: readonly LifecycleAction[] = Object.freeze([] as const);',
    );
    assert.ok(
      mentions(run(checkActionMatrix, { actionsModel }), 'does not require a reason for archive'),
    );
  });

  it('rejects a delete appearing on the surface', () => {
    const screen = `${file('screen')}\nconst probe = 'adminDesignTemplateDelete';\n`;
    assert.ok(mentions(run(checkActionMatrix, { screen }), 'names a delete'));
  });
});

describe('the command bodies', () => {
  it('rejects a body carrying a field the server owns', () => {
    const service = file('service').replace(
      'const body: PublishDesignTemplateBody = { expectedCurrentVersion };',
      'const body = { expectedCurrentVersion, targetStatus: 1 } as PublishDesignTemplateBody;',
    );
    const failures = run(checkCommandBodies, { service });
    assert.ok(mentions(failures, 'publish does not send the token alone'));
    assert.ok(mentions(failures, 'sends server-owned "targetStatus"'));
  });

  it('rejects a token that is not the authoritative version', () => {
    const screen = file('screen').replace(
      'expectedCurrentVersion: detail.currentVersion?.version ?? 0,',
      'expectedCurrentVersion: 1,',
    );
    assert.ok(
      mentions(
        run(checkCommandBodies, { screen }),
        'the concurrency token is not the authoritative',
      ),
    );
  });
});

describe('the readiness panel', () => {
  it('rejects dropping a GRD-T01 condition', () => {
    const readinessModel = file('readinessModel').replaceAll('MEDIA_ELIGIBLE', 'MEDIA_SOMETHING');
    assert.ok(
      mentions(run(checkReadinessConcepts, { readinessModel }), 'condition MEDIA_ELIGIBLE'),
    );
  });

  it('rejects losing the state for a condition the client cannot prove', () => {
    const readinessModel = file('readinessModel').replaceAll('CHECKED_ON_PUBLISH', 'READY');
    assert.ok(
      mentions(run(checkReadinessConcepts, { readinessModel }), 'no state for a condition'),
    );
  });

  it('rejects a panel that hides conditions', () => {
    const readinessPanel = file('readinessPanel').replace(
      'report.rows.map(',
      'report.rows.filter((row) => row.state !== "CHECKED_ON_PUBLISH").map(',
    );
    assert.ok(mentions(run(checkReadinessConcepts, { readinessPanel }), 'filters the conditions'));
  });

  it('rejects blocking publish on a condition the client could not prove', () => {
    const readinessModel = file('readinessModel').replace(
      "(row.condition === 'IMMUTABLE_VERSION' || row.condition === 'SCOPE_COMPLETE')",
      "(row.condition === 'IMMUTABLE_VERSION' || row.condition === 'MEDIA_ELIGIBLE')",
    );
    const failures = run(checkReadinessConcepts, { readinessModel });
    assert.ok(mentions(failures, 'SCOPE_COMPLETE no longer blocks'));
    assert.ok(mentions(failures, 'MEDIA_ELIGIBLE blocks'));
  });

  it('names every GRD-T01 condition it rules on', () => {
    assert.equal(READINESS_CONDITIONS.length, 7);
  });
});

describe('the cache behaviour', () => {
  it('rejects a command that may retry', () => {
    const command = file('command').replace('retry: false,', '');
    assert.ok(mentions(run(checkCacheBehaviour, { command }), 'may retry'));
  });

  it('rejects a second authoritative re-read', () => {
    const command = file('command').replace(
      'void fetchLifecycleDetail(templateId)',
      'void fetchLifecycleDetail(templateId).then(() => fetchLifecycleDetail(templateId))',
    );
    assert.ok(mentions(run(checkCacheBehaviour, { command }), 'authoritative re-reads, expected'));
  });

  it('rejects a stale reason surviving a conflict', () => {
    const command = file('command').replace(
      'setReasonInvalidated(requiresReason(request.action));',
      'setReasonInvalidated(false);',
    );
    assert.ok(mentions(run(checkCacheBehaviour, { command }), 'keeps its old confirmation'));
  });

  it('rejects an optimistic flip', () => {
    const command = `${file('command')}\nconst probe = { onMutate: () => undefined };\n`;
    assert.ok(mentions(run(checkCacheBehaviour, { command }), 'flips state optimistically'));
  });

  it('rejects classifying a failure from the message', () => {
    const failureModel = file('failureModel').replace(
      'switch (normalized.httpStatus) {',
      "if (normalized.message.includes('conflict')) return 'stale-state';\n  switch (normalized.httpStatus) {",
    );
    assert.ok(mentions(run(checkCacheBehaviour, { failureModel }), 'branches on message text'));
  });
});

describe('the copy rulings', () => {
  it('rejects copy that lets archive read as a delete', () => {
    const copy = file('copy').replace('không phải xoá', 'là xoá');
    assert.ok(mentions(run(checkCopyRulings, { copy }), 'is not a delete'));
  });

  it('rejects copy that lets restore read as a republication', () => {
    const copy = file('copy').replace('không được xuất bản lại', 'sẽ được xuất bản lại');
    assert.ok(mentions(run(checkCopyRulings, { copy }), 'not a republication'));
  });

  it('rejects a refusal that names a guard the wire never published', () => {
    const copy = file('copy').replace(
      /notReady:\s*\n?\s*'([^']*)'/,
      "notReady:\n      'MEDIA_ELIGIBLE chưa đạt.'",
    );
    assert.ok(mentions(run(checkCopyRulings, { copy }), 'names "MEDIA_ELIGIBLE"'));
  });
});

describe('contract immutability', () => {
  /**
   * The phase rewound to the world the freeze describes.
   *
   * The frozen digests say "**A04** added no operation", which was the whole
   * artifact right up to `APP3-B05A` — a backend checkpoint that legitimately
   * publishes one. The rule is now ruled in both directions, so the ban is
   * proved against the world it is about rather than deleted along with it.
   */
  const beforeB05A = () =>
    file('phase').replace(/\nAPP3-B05A = [^\n]*\n/, '\nAPP3-B05A = READY — NOT STARTED\n');

  it('rejects any movement of the published document, before B05A', () => {
    const document = JSON.parse(file('openapi'));
    document.paths['/api/admin/design-templates/{templateId}/something'] = { post: {} };
    const failures = run(checkContractImmutability, {
      phase: beforeB05A(),
      openapi: JSON.stringify(document),
    });
    assert.ok(mentions(failures, 'APP3-A04 adds no API operation'));
  });

  it('rejects any movement of the generated client, before B05A', () => {
    const root = rootWith({ phase: beforeB05A() });
    const generated = join(root, 'packages/api-client/src/generated/embroidery-api.ts');
    writeFileSync(generated, `${readFileSync(generated, 'utf8')}\n// edited\n`, 'utf8');
    const failures = [];
    checkContractImmutability(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'the generated client must not move'));
  });

  it('accepts the artifact B05A legitimately published', () => {
    assert.deepEqual(run(checkContractImmutability), []);
  });

  it('still counts the surface once the digests are released', () => {
    // Releasing the byte-level freeze must not release the assertion. The counts
    // are checked against the accepted-surface authority, which moves only when
    // a checkpoint records that it did — so an operation nobody accounted for
    // still fails here.
    const document = JSON.parse(file('openapi'));
    document.paths['/api/admin/design-templates/{templateId}/something'] = { post: {} };
    const failures = run(checkContractImmutability, { openapi: JSON.stringify(document) });
    assert.ok(mentions(failures, 'expected'));
  });
});

describe('boundaries', () => {
  it('rejects a migration or a root script', () => {
    const rootPackage = JSON.stringify({ scripts: { only: 'one' } });
    assert.ok(mentions(run(checkBoundaries, { rootPackage }), 'root scripts, expected 30'));
  });

  it('rejects an unregistered command', () => {
    const index = file('index').replace('CMD-CHECK-APP3-A04', 'CMD-CHECK-SOMETHING-ELSE');
    assert.ok(mentions(run(checkBoundaries, { index }), 'does not index CMD-CHECK-APP3-A04'));
  });

  it('rejects a feature file over the 400-line limit', () => {
    const screen = `${file('screen')}\n${'// filler\n'.repeat(400)}`;
    assert.ok(mentions(run(checkBoundaries, { screen }), 'over the 400 limit'));
  });
});
