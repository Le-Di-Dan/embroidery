/**
 * The Design Template restore contract (`APP3-B04A`, `TR-LC24-06`).
 *
 * Docker-free, so every collaborator is a double and what is proved here is the
 * *decision*: that `ARCHIVED` is the only admissible source, that the reason and
 * the token are required, that the audit row is a fourth distinct fact, and —
 * mostly — the long list of things restore is forbidden to touch. The SQL, the
 * cleared archive marker, the preserved timestamps and the race are proved live
 * in `test/integration/design-template-restore.integration.spec.ts`.
 *
 * Its own suite rather than more cases in `design-template-lifecycle.spec.ts`:
 * that file was already 692 lines at entry, past the CLAUDE.md §6 test maximum
 * of 600, and growing it further to add a transition would deepen a breach this
 * checkpoint is not authorised to repair.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { persistenceError } from '@embroidery/database';

import { resolveArtifactPath } from '../../openapi/openapi-artifact';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import { DesignTemplateLifecycleUseCase } from './application/design-template-lifecycle.use-case';
import { DESIGN_TEMPLATE_LIFECYCLE_ACTIONS } from './application/design-template-audit.recorder';
import {
  ArchiveDesignTemplateBody,
  RestoreDesignTemplateBody,
} from './presentation/schemas/admin-design-template.request';
import {
  ADMIN_TEMPLATE_ADAPTER_SOURCE,
  ADMIN_TEMPLATE_CONTROLLER_SOURCE,
} from './tests/admin-template-sources';
import type { DesignTemplateAuditRecorder } from './application/design-template-audit.recorder';
import type {
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
} from './domain/repositories/design-template.repository';

const USE_CASE_SOURCE = readFileSync(
  join(__dirname, 'application/design-template-lifecycle.use-case.ts'),
  'utf8',
);

const TEMPLATE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6201';
const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6202';
const SIDE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6203';
const AREA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6204';

const RESTORE_ROUTE = '/api/admin/design-templates/{templateId}/restore';

interface OpenApiOperation {
  readonly operationId?: string;
  readonly requestBody?: { content?: Record<string, { schema?: unknown }> };
  readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

const document = JSON.parse(readFileSync(resolveArtifactPath(__dirname), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

function template(overrides: Partial<DesignTemplate> = {}): DesignTemplate {
  return {
    id: TEMPLATE_ID as DesignTemplateId,
    name: 'Hoa sen',
    slug: 'hoa-sen',
    description: undefined,
    productId: PRODUCT_ID as never,
    productSideId: SIDE_ID as never,
    embroideryAreaId: AREA_ID as never,
    status: 'ARCHIVED',
    currentVersion: 2,
    previewDerivativeId: undefined,
    archivedAt: new Date('2026-08-01T09:00:00.000Z'),
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

interface HarnessOptions {
  readonly row?: DesignTemplate | undefined;
  readonly throws?: Error;
  readonly auditThrows?: Error;
}

/**
 * A use case over recording doubles.
 *
 * Every repository method the checkpoint must never call is present and throws,
 * so "restore creates no version" is proved by the call being *impossible*
 * rather than by an assertion nobody would notice going missing.
 */
function harness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const restored: Record<string, unknown>[] = [];
  const written: Record<string, unknown>[] = [];
  let committed = false;

  const forbidden = (name: string) => () => {
    calls.push(name);
    throw new Error(`APP3-B04A must never call ${name}.`);
  };

  const repository = {
    findById: () => Promise.resolve('row' in options ? options.row : template()),
    findLatestVersion: () =>
      Promise.resolve(
        'row' in options && options.row?.currentVersion === 0
          ? undefined
          : {
              id: 'version-2',
              designTemplateId: TEMPLATE_ID,
              version: 2,
              designDocument: {},
              documentSchemaVersion: 1,
              // Stamped when it was published, and untouched by the restore.
              publishedAt: new Date('2026-07-30T00:00:00.000Z'),
              createdAt: new Date('2026-07-29T00:00:00.000Z'),
            },
      ),
    restore: (input: Record<string, unknown>) => {
      calls.push('restore');
      restored.push(input);
      return options.throws === undefined ? Promise.resolve() : Promise.reject(options.throws);
    },
    publishCurrentVersion: forbidden('publishCurrentVersion'),
    unpublish: forbidden('unpublish'),
    archive: forbidden('archive'),
    saveDraftVersion: forbidden('saveDraftVersion'),
    publishVersion: forbidden('publishVersion'),
    assignInitialScope: forbidden('assignInitialScope'),
    ensureAssetAssociation: forbidden('ensureAssetAssociation'),
    attachAsset: forbidden('attachAsset'),
    setPreviewDerivative: forbidden('setPreviewDerivative'),
  } as unknown as DesignTemplateRepository;

  const audit = {
    recordLifecycle: (input: Record<string, unknown>) => {
      calls.push('audit');
      if (options.auditThrows !== undefined) return Promise.reject(options.auditThrows);
      written.push(input);
      return Promise.resolve();
    },
  } as unknown as DesignTemplateAuditRecorder;

  // A transaction that only "commits" when the whole body resolves — enough to
  // show that a failing audit row takes the transition down with it.
  const transactions = {
    runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
      const result = await work();
      committed = true;
      return result;
    },
  } as never;

  const publication = {
    evaluate: () => {
      calls.push('publicationGuard');
      throw new Error('APP3-B04A must never run the publication guard.');
    },
  } as never;

  return {
    useCase: new DesignTemplateLifecycleUseCase(repository, publication, audit, transactions),
    calls,
    restored,
    written,
    didCommit: () => committed,
  };
}

const command = { templateId: TEMPLATE_ID, expectedCurrentVersion: 2, reason: 'Bán lại mẫu này' };

// ---------------------------------------------------------------------------
// 1–7 · The published contract
// ---------------------------------------------------------------------------
describe('the published restore contract', () => {
  it('publishes exactly one route, at the locked path and operation id', () => {
    expect(document.paths[RESTORE_ROUTE]?.post?.operationId).toBe('adminDesignTemplate_restore');
    // POST, and nothing else on the path: restore is a command, not a resource.
    expect(Object.keys(document.paths[RESTORE_ROUTE] ?? {})).toEqual(['post']);
  });

  it('answers with the concrete Admin detail projection, never void', () => {
    const success = document.paths[RESTORE_ROUTE]?.post?.responses?.['200'];
    const schema = JSON.stringify(success?.content?.['application/json']?.schema ?? {});
    expect(schema).toContain('AdminDesignTemplateDetailResponse');
  });

  it('takes the strict token-and-reason body', () => {
    const body = document.paths[RESTORE_ROUTE]?.post?.requestBody;
    expect(JSON.stringify(body?.content?.['application/json']?.schema ?? {})).toContain(
      'RestoreDesignTemplateBody',
    );
  });

  it('is an Admin write carrying the origin and JSON guards', () => {
    expect(ADMIN_TEMPLATE_CONTROLLER_SOURCE).toMatch(
      /@Post\(':templateId\/restore'\)\s*\n\s*@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/,
    );
    expect(ADMIN_TEMPLATE_CONTROLLER_SOURCE).toMatch(/@UseGuards\(AuthenticatedAdminGuard\)/);
  });

  it('requires a non-negative token and a bounded, non-blank reason', () => {
    const schema = zodSchemaOf(RestoreDesignTemplateBody);
    if (schema === undefined) throw new Error('the DTO carries no Zod schema');

    expect(schema.safeParse({ expectedCurrentVersion: 2, reason: 'Bán lại' }).success).toBe(true);
    expect(schema.safeParse({ expectedCurrentVersion: 2 }).success).toBe(false);
    expect(schema.safeParse({ reason: 'Bán lại' }).success).toBe(false);
    expect(schema.safeParse({ expectedCurrentVersion: -1, reason: 'x' }).success).toBe(false);
    // Zero is legal: a header archived before its first save has counter 0.
    expect(schema.safeParse({ expectedCurrentVersion: 0, reason: 'x' }).success).toBe(true);
    // Blank satisfies "required" and none of its purpose.
    expect(schema.safeParse({ expectedCurrentVersion: 2, reason: '   ' }).success).toBe(false);
    expect(schema.safeParse({ expectedCurrentVersion: 2, reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('rejects every field the server owns, including a target state', () => {
    const schema = zodSchemaOf(RestoreDesignTemplateBody);
    if (schema === undefined) throw new Error('the DTO carries no Zod schema');
    for (const owned of [
      { status: 'PUBLISHED' },
      { archivedAt: null },
      { publishedAt: 'now' },
      { version: 3 },
      { document: {} },
      { productId: PRODUCT_ID },
      { force: true },
    ]) {
      expect(schema.safeParse({ ...command, ...owned }).success).toBe(false);
    }
  });

  it('shares one reason bound with archive rather than declaring a second', () => {
    const archive = zodSchemaOf(ArchiveDesignTemplateBody);
    const restore = zodSchemaOf(RestoreDesignTemplateBody);
    if (archive === undefined || restore === undefined) throw new Error('missing Zod schema');
    const overlong = { expectedCurrentVersion: 1, reason: 'x'.repeat(501) };
    expect(archive.safeParse(overlong).success).toBe(restore.safeParse(overlong).success);
  });
});

// ---------------------------------------------------------------------------
// 8, 24–25 · The transition itself
// ---------------------------------------------------------------------------
describe('restoring an archived template', () => {
  it('moves ARCHIVED to DRAFT through the guarded persistence seam', async () => {
    const { useCase, calls, restored } = harness();

    await useCase.restore(command);

    expect(calls).toEqual(['restore', 'audit']);
    expect(restored[0]).toMatchObject({ id: TEMPLATE_ID, expectedCurrentVersion: 2 });
    // The instant is the server's, never the caller's.
    expect(restored[0]?.['at']).toBeInstanceOf(Date);
  });

  it('restores a zero-version header and stays at zero versions', async () => {
    const { useCase, restored, written } = harness({
      row: template({ currentVersion: 0 }),
    });

    await useCase.restore({ ...command, expectedCurrentVersion: 0 });

    expect(restored[0]).toMatchObject({ expectedCurrentVersion: 0 });
    // A publication would need a version; a restore does not, and must not
    // invent one to satisfy a rule that belongs to a different transition.
    expect(written[0]).toMatchObject({ version: 0 });
  });

  it('sends no scope, document, status or archive marker to persistence', async () => {
    const { useCase, restored } = harness();
    await useCase.restore(command);
    for (const owned of [
      'productId',
      'productSideId',
      'embroideryAreaId',
      'status',
      'archivedAt',
      'designDocument',
      'currentVersion',
    ]) {
      expect(restored[0]).not.toHaveProperty(owned);
    }
  });
});

// ---------------------------------------------------------------------------
// 19–23 · Refusals, each writing nothing
// ---------------------------------------------------------------------------
describe('what restore refuses', () => {
  for (const status of ['DRAFT', 'PUBLISHED'] as const) {
    it(`refuses a ${status} template as a conflict, writing nothing`, async () => {
      const { useCase, calls } = harness({ row: template({ status }) });

      await expect(useCase.restore(command)).rejects.toMatchObject({
        code: 'DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED',
      });
      expect(calls).toHaveLength(0);
    });
  }

  it('answers a safe not-found for an unknown template', async () => {
    const { useCase, calls } = harness({ row: undefined });
    await expect(useCase.restore(command)).rejects.toMatchObject({
      code: 'DESIGN_TEMPLATE_NOT_FOUND',
    });
    expect(calls).toHaveLength(0);
  });

  it('turns a stale compare-and-set into the version conflict, not a 500', async () => {
    const { useCase, written } = harness({
      throws: persistenceError({
        kind: 'INVARIANT_VIOLATION',
        code: 'STALE_WRITE',
        operation: 'DesignTemplateRepository.restore',
        message: 'changed',
      }),
    });

    await expect(useCase.restore(command)).rejects.toMatchObject({
      code: 'DESIGN_TEMPLATE_VERSION_CONFLICT',
    });
    expect(written).toHaveLength(0);
  });

  it('turns a vanished row into the not-found, not a 500', async () => {
    const { useCase } = harness({
      throws: persistenceError({
        kind: 'INVALID_REFERENCE',
        code: 'RECORD_NOT_FOUND',
        operation: 'DesignTemplateRepository.restore',
        message: 'gone',
      }),
    });
    await expect(useCase.restore(command)).rejects.toMatchObject({
      code: 'DESIGN_TEMPLATE_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// 26–30 · Audit
// ---------------------------------------------------------------------------
describe('the audit evidence', () => {
  it('records a fourth distinct action, never reusing unpublish', () => {
    expect(DESIGN_TEMPLATE_LIFECYCLE_ACTIONS.RESTORED).toBe('design_template.restored');
    const actions = Object.values(DESIGN_TEMPLATE_LIFECYCLE_ACTIONS);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('carries the actor-free bounded summary, the reason and nothing else', async () => {
    const { useCase, written } = harness();

    await useCase.restore(command);

    expect(written).toEqual([
      {
        templateId: TEMPLATE_ID,
        transition: 'RESTORED',
        from: 'ARCHIVED',
        to: 'DRAFT',
        version: 2,
        reason: 'Bán lại mẫu này',
      },
    ]);
  });

  it('writes the audit row inside the transaction with the transition', async () => {
    const { useCase, calls } = harness();
    await useCase.restore(command);
    // Both, in order, and both inside `runInTransaction` — asserted on the
    // source because ordering alone cannot show the boundary.
    expect(calls).toEqual(['restore', 'audit']);
    expect(USE_CASE_SOURCE).toMatch(/runInTransaction\(async \(\) => \{[\s\S]*?recordLifecycle\(/);
  });

  it('rolls the transition back when the evidence cannot be written', async () => {
    const { useCase, didCommit } = harness({ auditThrows: new Error('audit down') });

    await expect(useCase.restore(command)).rejects.toThrow('audit down');
    // The transaction body never completed, so nothing commits: PO-03 makes the
    // status change and its evidence one atomic unit.
    expect(didCommit()).toBe(false);
  });

  it('writes no audit row for a refusal', async () => {
    const { useCase, written } = harness({ row: template({ status: 'DRAFT' }) });
    await expect(useCase.restore(command)).rejects.toBeDefined();
    expect(written).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 15–18, 38–43 · What restore must never do
// ---------------------------------------------------------------------------
describe('what APP3-B04A must never do', () => {
  it('runs no publication guard — GRD-T01 belongs to publish', async () => {
    // The double throws if the guard is consulted; a template with a retired
    // scope and an unpublishable document must still restore.
    const { useCase, calls } = harness({ row: template({ embroideryAreaId: undefined }) });

    await expect(useCase.restore(command)).resolves.toBeDefined();
    expect(calls).not.toContain('publicationGuard');
  });

  it('never creates a version, association or document', async () => {
    const { useCase, calls } = harness();
    await useCase.restore(command);
    for (const forbidden of [
      'saveDraftVersion',
      'publishVersion',
      'ensureAssetAssociation',
      'attachAsset',
      'setPreviewDerivative',
    ]) {
      expect(calls).not.toContain(forbidden);
    }
  });

  it('never repairs scope or reaches another aggregate', () => {
    const restoreBody = /async restore\(command: RestoreCommand\)([\s\S]*?)\n {2}}\n/.exec(
      USE_CASE_SOURCE,
    );
    expect(restoreBody).not.toBeNull();
    expect(restoreBody?.[1]).not.toMatch(/productSideId:|embroideryAreaId:|productId:/);
    expect(restoreBody?.[1]).not.toMatch(/session|clone|snapshot|Outbox|prepareDesignDocument/i);
  });

  it('never deletes, and never publishes from ARCHIVED', () => {
    // `ARCHIVED` may appear only as a *source*. A `to: 'PUBLISHED'` beside it,
    // or any delete in the adapter, would be the transition LC-24 forbids.
    expect(USE_CASE_SOURCE).not.toMatch(/from: 'ARCHIVED',\s*\n\s*to: 'PUBLISHED'/);
    expect(ADMIN_TEMPLATE_ADAPTER_SOURCE).not.toMatch(/\.delete\(/);
    expect(ADMIN_TEMPLATE_CONTROLLER_SOURCE).not.toMatch(/@Delete\(/);
  });

  it('constrains the restore predicate to ARCHIVED alone', () => {
    const block = /async restore\([\s\S]*?\n {2}}\n/.exec(ADMIN_TEMPLATE_ADAPTER_SOURCE);
    expect(block?.[0]).toContain("['ARCHIVED']");
    // Cleared, not preserved: the marker describes the current state.
    expect(block?.[0]).toMatch(/archivedAt: null/);
    // Never in the SET: the retained counter is what comes back.
    expect(block?.[0]).not.toMatch(/currentVersion:/);
    expect(block?.[0]).not.toMatch(/publishedAt/);
  });
});
