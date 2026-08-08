/**
 * Regressions for the `APP3-B03A` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a working system: a caller-chosen version number, a
 * draft version stamped as published, an event appended before the association
 * it names, a second event for an association that already existed, and P02
 * imported "to be safe" — which would quietly implement half of `APP3-B04`'s
 * publication guard.
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
  REPO_ROOT,
  SAVE_ROUTE,
  checkApp3B03A,
  checkBoundaries,
  checkDocumentAuthority,
  checkMediaAuthority,
  checkNormalizationProducer,
  checkRequestContract,
  checkSaveSemantics,
  checkSurface,
  read,
} from './check-app3-b03a.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b03a-'));
  temporaries.push(base);
  const extras = ['tools/check-app3-b03a.mjs', 'tools/app3-accepted-surface.mjs'];
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
  const root = mkdtempSync(join(tmpdir(), 'app3-b03a-case-'));
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
  it('reports the B03A surface when B03A is the frontier', () => {
    const phase = ['# phase', '', '```text', 'APP3-B03A = COMPLETE — REVIEW_DELIVERED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 26);
    assert.equal(surface.operations, 31);
    assert.equal(surface.schemas, 73);
  });

  it('keeps B03 frozen at its own world', () => {
    // A later checkpoint must never move an accepted world's numbers.
    const phase = ['# phase', '', '```text', 'APP3-B03 = COMPLETE — REVIEW_ACCEPTED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 25);
    assert.equal(surface.operations, 30);
    assert.equal(surface.schemas, 72);
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects losing the save operation', () => {
    const openapi = openapiWith((d) => {
      delete d.paths[SAVE_ROUTE];
    });
    // Derived, not pinned at 26: `APP3-B04` legitimately moved the accepted
    // surface, and a literal here would fail on a correct repository.
    const expected = acceptedSurface(REPO_ROOT).paths;
    assert.ok(mentions(run(checkSurface, { openapi }), `paths, expected ${String(expected)}`));
  });

  it('rejects one more Admin Template operation than the accepted world explains', () => {
    const openapi = openapiWith((d) => {
      d.paths['/api/admin/design-templates/{templateId}/preview'] = {
        post: { operationId: 'adminDesignTemplate_preview' },
      };
    });
    const allowed = acceptedAdminTemplateOperationCount(REPO_ROOT);
    assert.ok(
      mentions(
        run(checkSurface, { openapi }),
        `admin design-template operations, expected ${String(allowed)}`,
      ),
    );
  });

  it("rejects APP3-B04's lifecycle routes while B04 is unstarted", () => {
    // Publish now exists in the real artifact, so *adding* it proves nothing.
    // This rebuilds the undelivered world and proves it is still refused there.
    const phase = file('phase').replace(
      /\nAPP3-B04 = COMPLETE[^\n]*\n/,
      '\nAPP3-B04 = READY — NOT STARTED\n',
    );
    const failures = run(checkSurface, { phase });
    assert.ok(mentions(failures, 'belongs to APP3-B04'), failures.join('\n'));
  });

  it('rejects a lifecycle route going missing once B04 is accepted', () => {
    const openapi = openapiWith((d) => {
      delete d.paths['/api/admin/design-templates/{templateId}/publish'];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'APP3-B04 is delivered but'));
  });

  it('rejects a renamed operation id', () => {
    const openapi = openapiWith((d) => {
      d.paths[SAVE_ROUTE].put.operationId = 'adminDesignTemplate_putDocument';
    });
    assert.ok(
      mentions(run(checkSurface, { openapi }), 'expected "adminDesignTemplate_saveDocument"'),
    );
  });
});

describe('the request contract', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkRequestContract), []);
  });

  it('rejects a body that stops referencing the generated DesignDocument', () => {
    // The `APP3-B08-C1` defect: an open object where the P01 graph belongs.
    const openapi = openapiWith((d) => {
      d.components.schemas['SaveDesignTemplateDocumentBody'].properties['document'] = {
        type: 'object',
        additionalProperties: true,
      };
    });
    assert.ok(
      mentions(
        run(checkRequestContract, { openapi }),
        'does not reference the generated DesignDocument',
      ),
    );
  });

  it('rejects a third field on the save body', () => {
    const openapi = openapiWith((d) => {
      d.components.schemas['SaveDesignTemplateDocumentBody'].properties['publishedAt'] = {
        type: 'string',
      };
    });
    assert.ok(mentions(run(checkRequestContract, { openapi }), 'the save body publishes'));
  });

  it('rejects a generated response that degrades to void', () => {
    const clientSchemas = file('clientSchemas').replace(
      /export type AdminDesignTemplateSaveDocument200 = [^;]+;/,
      'export type AdminDesignTemplateSaveDocument200 = void;',
    );
    assert.ok(mentions(run(checkRequestContract, { clientSchemas }), 'generates as "void"'));
  });
});

describe('the compare-and-set', () => {
  it('accepts the delivered implementation', () => {
    assert.deepEqual(run(checkSaveSemantics), []);
  });

  it('rejects dropping the expected version from the predicate', () => {
    // Read-then-write: both racing saves would believe they won.
    const adapter = file('adapter').replace(
      'eq(designTemplates.currentVersion, input.expectedCurrentVersion),',
      '',
    );
    assert.ok(mentions(run(checkSaveSemantics, { adapter }), 'does not compare-and-set'));
  });

  it('rejects dropping the DRAFT requirement', () => {
    const adapter = file('adapter').replace("eq(designTemplates.status, 'DRAFT'),", '');
    assert.ok(mentions(run(checkSaveSemantics, { adapter }), 'does not require a DRAFT header'));
  });

  it('rejects stamping a draft version as published', () => {
    const adapter = file('adapter').replace('publishedAt: null,', 'publishedAt: new Date(),');
    assert.ok(mentions(run(checkSaveSemantics, { adapter }), 'published_at null'));
  });

  it('rejects a read-then-insert association', () => {
    const adapter = file('adapter').replace(/\.onConflictDoNothing\(\{[\s\S]*?\}\)/, '');
    assert.ok(mentions(run(checkSaveSemantics, { adapter }), 'not conflict-atomic'));
  });

  it('rejects widening publishVersion to a nullable stamp', () => {
    const repository = file('repository').replace(
      '  readonly publishedAt: Date;\n}',
      '  readonly publishedAt: Date | null;\n}',
    );
    assert.ok(
      mentions(run(checkSaveSemantics, { repository }), 'no longer requires a real publishedAt'),
    );
  });

  it('accepts the read model keeping an optional publishedAt', () => {
    // The other half of that rule: a draft version genuinely has none, so the
    // *read* type must stay optional and the gate must not object.
    assert.ok(!mentions(run(checkSaveSemantics), 'publishedAt'));
  });

  it('rejects letting the caller choose the version number', () => {
    const request = file('request').replace(
      'expectedCurrentVersion: z.number().int().min(0),',
      'expectedCurrentVersion: z.number().int().min(0),\n    version: z.number(),',
    );
    assert.ok(mentions(run(checkSaveSemantics, { request }), 'lets the caller choose'));
  });

  it('rejects leaving a stale compare-and-set untranslated', () => {
    // Untranslated it surfaces as a 500 against a published 409.
    const useCase = file('useCase').replaceAll(
      'DESIGN_TEMPLATE_VERSION_CONFLICT',
      'SOMETHING_ELSE',
    );
    assert.ok(mentions(run(checkSaveSemantics, { useCase }), 'not translated to the conflict'));
  });
});

describe('document authority', () => {
  it('accepts the delivered implementation', () => {
    assert.deepEqual(run(checkDocumentAuthority), []);
  });

  it('rejects losing a P01 stage', () => {
    for (const call of ['prepareDesignDocument', 'validateDesignDocumentContext']) {
      const documents = file('documents').replaceAll(`${call}(`, 'noop(');
      assert.ok(
        mentions(run(checkDocumentAuthority, { documents }), `does not call ${call}`),
        call,
      );
    }
  });

  it("rejects importing APP3-B04's publication geometry", () => {
    const documents = `${file('documents')}\nimport { validateDocumentWithinEmbroideryArea } from '@embroidery/design-engine';\n`;
    assert.ok(mentions(run(checkDocumentAuthority, { documents }), 'design-engine'));
  });

  it('rejects reading object storage to decide a write', () => {
    const useCase = `${file('useCase')}\nconst probe = 'storageKey';\n`;
    assert.ok(mentions(run(checkDocumentAuthority, { useCase }), 'object storage'));
  });

  it('rejects persisting the request body instead of the canonical document', () => {
    const useCase = file('useCase').replaceAll('outcome.document', 'command.document');
    assert.ok(mentions(run(checkDocumentAuthority, { useCase }), 'canonical prepared document'));
  });
});

describe('the normalization producer', () => {
  it('accepts the delivered implementation', () => {
    assert.deepEqual(run(checkNormalizationProducer), []);
  });

  it('rejects appending the event before the association', () => {
    // `APP3-G06`: an event written before the association that defines its work
    // cannot carry its context.
    const source = file('useCase');
    const associationBlock = /      for \(const assetId of referencedAssetIds\) \{/.exec(source);
    assert.ok(associationBlock !== null);
    const useCase = source.replace(
      '      for (const assetId of referencedAssetIds) {',
      '      await this.outbox.append({ eventType: 1 });\n      for (const assetId of referencedAssetIds) {',
    );
    assert.ok(mentions(run(checkNormalizationProducer, { useCase }), 'not appended after'));
  });

  it('rejects re-requesting work for an association that already existed', () => {
    const useCase = file('useCase').replace('if (!association.created) continue;', '');
    assert.ok(mentions(run(checkNormalizationProducer, { useCase }), 'second event'));
  });

  it('rejects a guessed association id in the reference', () => {
    const useCase = file('useCase').replace(
      'designTemplateAssetId: association.designTemplateAssetId,',
      "designTemplateAssetId: 'guessed',",
    );
    assert.ok(mentions(run(checkNormalizationProducer, { useCase }), 'durable association id'));
  });

  it('rejects hand-assembling the payload instead of using the shared builder', () => {
    const useCase = file('useCase').replaceAll('buildAssetNormalizationRequestedPayload', 'inline');
    assert.ok(
      mentions(
        run(checkNormalizationProducer, { useCase }),
        'buildAssetNormalizationRequestedPayload',
      ),
    );
  });

  it('rejects a G06 allowlist that does not name this producer', () => {
    const g06 = file('g06').replaceAll(CANONICAL_FILES.useCase, 'some/other/file.ts');
    assert.ok(
      mentions(run(checkNormalizationProducer, { g06 }), 'sanction the APP3-B03A producer'),
    );
  });
});

describe('the media allowlist', () => {
  it('accepts the delivered implementation', () => {
    assert.deepEqual(run(checkMediaAuthority), []);
  });

  it('rejects widening the lane past Template artwork', () => {
    const media = file('media').replace("'TEMPLATE_SOURCE'", "'CUSTOMER_UPLOAD'");
    assert.ok(mentions(run(checkMediaAuthority, { media }), 'TEMPLATE_SOURCE'));
  });

  it('rejects dropping the scoped read that makes it fail closed', () => {
    const media = file('media').replace('findScopedByIds(', 'listDerivativesFor(');
    assert.ok(mentions(run(checkMediaAuthority, { media }), 'scoped Asset read'));
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

  it('rejects a root script for this checkpoint', () => {
    const rootPackage = JSON.stringify({
      scripts: Object.fromEntries(
        Array.from({ length: 31 }, (_, index) => [`s${String(index)}`, 'x']),
      ),
    });
    assert.ok(mentions(run(checkBoundaries, { rootPackage }), '31 root scripts'));
  });

  it('rejects an unwired provider', () => {
    const module = file('module').replace('SaveTemplateDocumentUseCase,', '');
    assert.ok(mentions(run(checkBoundaries, { module }), 'does not provide'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, predecessors and all', () => {
    assert.deepEqual(checkApp3B03A(REPO_ROOT), []);
  });
});
