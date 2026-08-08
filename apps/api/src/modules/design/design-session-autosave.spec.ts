/**
 * The Design Session autosave contract (`APP3-B08`).
 *
 * Docker-free, so every collaborator is a double and what is proved is the
 * *decision*: which documents may be saved, what the CAS is asked for, and what
 * autosave is forbidden to touch. The SQL itself is proved live.
 *
 * The cases worth reading twice are the media ones. A document that references
 * an image is only saveable because the derivative authority map contains that
 * derivative — and the map is built from this Session's own uploads plus what
 * its persisted document already references. So a cross-Session reference does
 * not fail a comparison; it fails because it was never in the allowlist. That is
 * asserted here by omission, which is the only way to prove a fail-closed rule.
 */
import 'reflect-metadata';

import { persistenceError } from '@embroidery/database';
import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '@embroidery/design-document';
import type { DesignDocumentContext } from '@embroidery/design-document';

import { DesignDocumentAuthority } from './application/design-document.authority';
import {
  AutosaveDesignSessionUseCase,
  DesignDocumentRejectedError,
} from './application/autosave-design-session.use-case';
import { SessionDocumentMediaAuthority } from './application/session-document-media.authority';
import type { SessionPlacementAuthority } from './application/session-placement.authority';
import { PublicDesignSessionController } from './presentation/public-design-session.controller';
import { AutosaveDesignSessionBody } from './presentation/schemas/design-session-autosave.request';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import type {
  DesignSession,
  DesignSessionId,
} from './domain/repositories/design-session.repository';

const SIDE_ID = 'side-1';
const AREA_ID = 'area-1';
const SESSION_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

/** The live placement the Session is bound to. Bounds are generous on purpose. */
const PLACEMENT: SessionPlacementAuthority = {
  side: {
    productSideId: SIDE_ID,
    code: 'front',
    retiredAt: null,
    imageWidthPx: 1000,
    imageHeightPx: 1200,
    physicalWidthMm: 400,
    physicalHeightMm: 480,
    pxPerMm: 2.5,
  },
  area: {
    embroideryAreaId: AREA_ID,
    productSideId: SIDE_ID,
    code: 'chest',
    retiredAt: null,
    boundXPx: 100,
    boundYPx: 150,
    boundWidthPx: 400,
    boundHeightPx: 300,
    maxWidthMm: 160,
    maxHeightMm: 120,
  },
};

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    productSideId: SIDE_ID,
    embroideryAreaId: AREA_ID,
    canvasWidthPx: 1000,
    canvasHeightPx: 1200,
    physicalWidthMm: 400,
    physicalHeightMm: 480,
    pxPerMm: 2.5,
    ...overrides,
  };
}

function transform(overrides: Record<string, unknown> = {}) {
  return {
    x: 150,
    y: 200,
    width: 100,
    height: 80,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

function imageElement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'image-1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform: transform(),
    assetId: 'asset-1',
    derivativeId: 'derivative-1',
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 600,
    ...overrides,
  };
}

function documentWith(elements: readonly unknown[], placement = snapshot()) {
  return { schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION, placement, elements };
}

/** A measured, editor-safe derivative — the only kind that may be placed. */
function derivativeRecord(overrides: Record<string, unknown> = {}) {
  return {
    derivativeId: 'derivative-1',
    assetId: 'asset-1',
    kind: 'NORMALIZED',
    status: 'READY',
    widthPx: 800,
    heightPx: 600,
    mediaType: 'image/webp',
    byteSize: 4096,
    ...overrides,
  };
}

function contextOf(records: readonly Record<string, unknown>[] = []): DesignDocumentContext {
  const derivatives = new Map();
  for (const record of records) derivatives.set(record['derivativeId'], record);
  return { derivatives };
}

const authority = new DesignDocumentAuthority();

const session = {
  id: SESSION_ID as DesignSessionId,
  productSideId: SIDE_ID,
  embroideryAreaId: AREA_ID,
  autosaveRevision: 3,
  status: 'ACTIVE',
  expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  documentSchemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  designDocument: documentWith([]),
  sessionSecretHash: 'digest',
} as unknown as DesignSession;

interface SaveCall {
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
  readonly expectedRevision: number;
}

/** A use case wired to doubles, with the calls it made recorded. */
function buildUseCase(
  options: {
    context?: DesignDocumentContext;
    placement?: SessionPlacementAuthority | undefined;
    onSave?: (input: SaveCall) => DesignSession | Error;
    current?: DesignSession | undefined;
  } = {},
) {
  const saves: SaveCall[] = [];
  // `??` cannot express "explicitly absent" — `undefined ?? default` is the
  // default, so a test asking for a missing session would silently get one.
  const currentSession = 'current' in options ? options.current : session;
  const placement = 'placement' in options ? options.placement : PLACEMENT;
  const sessions = {
    findById: () => Promise.resolve(currentSession),
    saveDocument: (input: SaveCall) => {
      saves.push(input);
      const result = options.onSave?.(input);
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(
        result ?? { ...session, autosaveRevision: input.expectedRevision + 1 },
      );
    },
  };
  const useCase = new AutosaveDesignSessionUseCase(
    { runInTransaction: <T>(work: () => Promise<T>) => work() } as never,
    authority,
    { resolve: () => Promise.resolve(placement) } as never,
    { contextFor: () => Promise.resolve(options.context ?? contextOf()) } as never,
    sessions as never,
  );
  return { useCase, saves };
}

/** Captures a rejection as a value; a bare `await` would fail the test itself. */
async function refusal(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

describe('the request contract', () => {
  const schema = zodSchemaOf(AutosaveDesignSessionBody);

  it('publishes a concrete schema through the global validation path', () => {
    expect(schema).toBeDefined();
  });

  it('rejects a missing expectedRevision', () => {
    expect(schema!.safeParse({ document: {} }).success).toBe(false);
  });

  it('rejects a negative or fractional revision', () => {
    for (const expectedRevision of [-1, 1.5]) {
      expect(schema!.safeParse({ expectedRevision, document: {} }).success).toBe(false);
    }
  });

  it('accepts revision zero', () => {
    expect(schema!.safeParse({ expectedRevision: 0, document: {} }).success).toBe(true);
  });

  it('rejects a missing document', () => {
    expect(schema!.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });

  it('rejects server-owned fields the caller must not set', () => {
    for (const extra of [
      { sessionId: SESSION_ID },
      { documentSchemaVersion: 1 },
      { revision: 9 },
      { expiresAt: '2026-01-01' },
    ]) {
      const parsed = schema!.safeParse({ expectedRevision: 1, document: {}, ...extra });
      expect(parsed.success).toBe(false);
    }
  });

  it('binds the body as a real DTO metatype on the controller', () => {
    const types = Reflect.getMetadata(
      'design:paramtypes',
      PublicDesignSessionController.prototype,
      'autosave',
    ) as unknown[];
    expect(types[0]).toBe(AutosaveDesignSessionBody);
  });
});

describe('document validation before persistence', () => {
  const validate = (candidate: unknown, context = contextOf()) =>
    authority.validateForSave(candidate, PLACEMENT, context);

  it('accepts an empty canonical document', () => {
    expect(validate(documentWith([])).ok).toBe(true);
  });

  it('rejects an unsupported schema version', () => {
    const future = documentWith([]);
    expect(validate({ ...future, schemaVersion: 99 })).toEqual({
      ok: false,
      rejection: 'DOCUMENT_SCHEMA_UNSUPPORTED',
    });
  });

  it('rejects a structurally invalid document', () => {
    expect(validate({ schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION })).toEqual({
      ok: false,
      rejection: 'DOCUMENT_STRUCTURE_INVALID',
    });
  });

  it('rejects unknown fields', () => {
    const outcome = validate({ ...documentWith([]), sneaked: true });
    expect(outcome.ok).toBe(false);
  });

  it('rejects a placement snapshot that does not match the live Side', () => {
    const tampered = documentWith([], snapshot({ productSideId: 'side-2' }));
    expect(validate(tampered)).toEqual({ ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' });
  });

  it('rejects a tampered canvas scale', () => {
    const tampered = documentWith([], snapshot({ pxPerMm: 10 }));
    expect(validate(tampered)).toEqual({ ok: false, rejection: 'DOCUMENT_PLACEMENT_MISMATCH' });
  });

  it('rejects a document that leaves the embroidery area', () => {
    const outside = documentWith([imageElement({ transform: transform({ x: 900, y: 1100 }) })]);
    const outcome = validate(outside, contextOf([derivativeRecord()]));
    expect(outcome).toEqual({ ok: false, rejection: 'DOCUMENT_OUT_OF_BOUNDS' });
  });

  it('persists the quantized canonical document, never the caller object', () => {
    const raw = documentWith([imageElement({ transform: transform({ x: 150.000000004 }) })]);
    const outcome = validate(raw, contextOf([derivativeRecord()]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.document).not.toBe(raw);
    const element = outcome.document.elements[0] as { transform: { x: number } };
    expect(element.transform.x).toBe(150);
  });
});

describe('media eligibility', () => {
  const validate = (elements: readonly unknown[], records: readonly Record<string, unknown>[]) =>
    authority.validateForSave(documentWith(elements), PLACEMENT, contextOf(records));

  it('accepts a READY NORMALIZED derivative this session may place', () => {
    expect(validate([imageElement()], [derivativeRecord()]).ok).toBe(true);
  });

  it('rejects a derivative that is not in the allowlist at all', () => {
    // No record supplied: this is exactly how a cross-Session reference fails.
    expect(validate([imageElement()], [])).toEqual({
      ok: false,
      rejection: 'DOCUMENT_MEDIA_INELIGIBLE',
    });
  });

  it('rejects a derivative belonging to a different asset', () => {
    const outcome = validate([imageElement()], [derivativeRecord({ assetId: 'asset-other' })]);
    expect(outcome).toEqual({ ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' });
  });

  it('rejects a non-NORMALIZED or non-READY derivative', () => {
    for (const override of [{ kind: 'CATALOG_PREVIEW' }, { status: 'PROCESSING' }]) {
      const outcome = validate([imageElement()], [derivativeRecord(override)]);
      expect(outcome).toEqual({ ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' });
    }
  });

  it('rejects an unmeasured derivative rather than guessing its size', () => {
    const outcome = validate(
      [imageElement()],
      [derivativeRecord({ widthPx: null, heightPx: null, mediaType: null, byteSize: null })],
    );
    expect(outcome).toEqual({ ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' });
  });

  it('rejects intrinsic dimensions that disagree with the canonical derivative', () => {
    const outcome = validate([imageElement({ intrinsicWidthPx: 801 })], [derivativeRecord()]);
    expect(outcome).toEqual({ ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' });
  });

  it('rejects one asset placed through two different derivatives', () => {
    const outcome = validate(
      [imageElement(), imageElement({ id: 'image-2', derivativeId: 'derivative-2' })],
      [derivativeRecord(), derivativeRecord({ derivativeId: 'derivative-2' })],
    );
    expect(outcome).toEqual({ ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' });
  });
});

describe('the durable save', () => {
  it('asks the CAS for exactly the caller revision and the canonical document', async () => {
    const { useCase, saves } = buildUseCase();
    await useCase.execute({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      document: documentWith([]),
    });

    expect(saves).toHaveLength(1);
    expect(saves[0]?.expectedRevision).toBe(3);
    expect(saves[0]?.documentSchemaVersion).toBe(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION);
    // Never `expires_at`, never the secret hash, never a status change.
    expect(Object.keys(saves[0] ?? {}).sort()).toEqual([
      'designDocument',
      'documentSchemaVersion',
      'expectedRevision',
      'id',
    ]);
  });

  it('returns the revision the database reports, not one it computed', async () => {
    const { useCase } = buildUseCase({
      onSave: () => ({ ...session, autosaveRevision: 4 }),
    });
    const view = await useCase.execute({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      document: documentWith([]),
    });
    expect(view.revision).toBe(4);
    expect(view.expiresAt).toBe(session.expiresAt.toISOString());
  });

  it('never writes when the document is refused', async () => {
    const { useCase, saves } = buildUseCase();
    const error = await refusal(
      useCase.execute({
        sessionId: SESSION_ID,
        expectedRevision: 3,
        document: documentWith([], snapshot({ productSideId: 'side-2' })),
      }),
    );
    expect(error).toBeInstanceOf(DesignDocumentRejectedError);
    expect(saves).toHaveLength(0);
  });

  it('never writes when the placement no longer resolves', async () => {
    const { useCase, saves } = buildUseCase({ placement: undefined });
    const error = await refusal(
      useCase.execute({ sessionId: SESSION_ID, expectedRevision: 3, document: documentWith([]) }),
    );
    expect(error).toBeInstanceOf(DesignDocumentRejectedError);
    expect(saves).toHaveLength(0);
  });

  it('maps a stale write to 409 and a vanished row to the same answer', async () => {
    for (const code of ['STALE_WRITE', 'RECORD_NOT_FOUND']) {
      // A real `PersistenceError`: `isPersistenceError` is an `instanceof`
      // check, so a look-alike would prove the mapping works on nothing.
      const failure = persistenceError({
        kind: 'INVARIANT_VIOLATION',
        code,
        message: 'guard',
        operation: 'saveDocument',
      });
      const { useCase } = buildUseCase({ onSave: () => failure });
      const error = (await refusal(
        useCase.execute({ sessionId: SESSION_ID, expectedRevision: 3, document: documentWith([]) }),
      )) as { getStatus?: () => number };
      expect(error.getStatus?.()).toBe(409);
    }
  });

  it('lets an unrelated persistence failure stay a failure, never a conflict', async () => {
    const outage = persistenceError({
      kind: 'DATABASE_UNAVAILABLE',
      code: 'DATABASE_UNAVAILABLE',
      message: 'down',
      operation: 'saveDocument',
    });
    const { useCase } = buildUseCase({ onSave: () => outage });
    const error = (await refusal(
      useCase.execute({ sessionId: SESSION_ID, expectedRevision: 3, document: documentWith([]) }),
    )) as { getStatus?: () => number };
    expect(error.getStatus).toBeUndefined();
  });

  it('answers a vanished session with the non-enumerating 401', async () => {
    const { useCase, saves } = buildUseCase({ current: undefined });
    const error = (await refusal(
      useCase.execute({ sessionId: SESSION_ID, expectedRevision: 3, document: documentWith([]) }),
    )) as { getStatus?: () => number };
    expect(error.getStatus?.()).toBe(401);
    expect(saves).toHaveLength(0);
  });

  it('exposes no secret, digest, storage or cookie material in the response', async () => {
    const { useCase } = buildUseCase();
    const view = await useCase.execute({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      document: documentWith([]),
    });
    const serialized = JSON.stringify(view);
    for (const forbidden of [
      'digest',
      'sessionSecretHash',
      'storageKey',
      'objectKey',
      'Set-Cookie',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('the media allowlist', () => {
  const derivativeRows = [
    {
      id: 'derivative-1',
      assetId: 'asset-1',
      kind: 'NORMALIZED',
      status: 'READY',
      widthPx: 800,
      heightPx: 600,
      mediaType: 'image/webp',
      byteSize: 4096,
    },
  ];

  function build(assetIds: string[], persisted: unknown) {
    const requested: string[][] = [];
    const media = new SessionDocumentMediaAuthority(
      {
        listDerivativesFor: (ids: string[]) => {
          requested.push([...ids]);
          return Promise.resolve(derivativeRows.filter((row) => ids.includes(row.assetId)));
        },
      } as never,
      { listAssetIds: () => Promise.resolve(assetIds) } as never,
    );
    // The persisted document travels on the session, so it has to be the one
    // handed to `contextFor` — not the shared fixture.
    const stored = { ...session, designDocument: persisted } as DesignSession;
    return { media, requested, stored };
  }

  it('allows this session uploads plus what the persisted document already references', async () => {
    const { media, requested, stored } = build(
      ['asset-1'],
      documentWith([imageElement({ assetId: 'asset-legacy' })]),
    );
    const context = await media.contextFor(stored);
    expect(requested[0]?.sort()).toEqual(['asset-1', 'asset-legacy']);
    expect(context.derivatives.get('derivative-1')?.assetId).toBe('asset-1');
  });

  it('asks for nothing when the session owns and references nothing', async () => {
    const { media, requested, stored } = build([], documentWith([]));
    const context = await media.contextFor(stored);
    expect(requested).toHaveLength(0);
    expect(context.derivatives.size).toBe(0);
  });

  it('survives an unreadable persisted document by allowing strictly less', async () => {
    const { media, requested, stored } = build(['asset-1'], 'not-a-document');
    const context = await media.contextFor(stored);
    expect(requested[0]).toEqual(['asset-1']);
    expect(context.derivatives.size).toBe(1);
  });
});
