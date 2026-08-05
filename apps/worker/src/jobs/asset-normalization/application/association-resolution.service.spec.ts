/**
 * Association-bound profile derivation (`IMP-D046` PO-03).
 *
 * This is the check `APP3-W01` stopped for, so the cases that matter are the
 * ones where the message looks fine and the world has moved: the association
 * now points at a different Asset, its owner was archived, the Session ended, or
 * the Asset left the lane the profile may process. Every one of those is a
 * request that is no longer authorized, and none of them is visible in the
 * payload.
 *
 * The repository is a double, deliberately: what is under test is the decision,
 * and a live database would prove the SQL instead.
 */
import { dispositionOf } from '../../../runtime/errors/worker-job-error';
import { SESSION_TRANSIENT_ASSET_STATUSES } from '../domain/inspection-pending';
import { NormalizationRejection, normalizationRejection } from '../domain/normalization-outcome';
import type {
  AssetNormalizationRepository,
  AssociationFacts,
  NormalizationSourceFacts,
} from '../domain/repositories/asset-normalization.repository';
import {
  AssociationResolutionService,
  PROFILE_BY_ASSOCIATION,
} from './association-resolution.service';

const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const ASSOCIATION = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

const source = (overrides: Partial<NormalizationSourceFacts> = {}): NormalizationSourceFacts => ({
  assetId: ASSET,
  storageKey: `development/originals/${ASSET}/original.png`,
  mediaType: 'image/png',
  byteSize: 1024n,
  checksum: `sha256:${'a'.repeat(64)}`,
  status: 'ACCEPTED',
  kind: 'CATALOG_MEDIA',
  classification: 'PRODUCTION_SENSITIVE',
  deleted: false,
  ...overrides,
});

function repository(options: {
  readonly association?: AssociationFacts | undefined;
  readonly asset?: NormalizationSourceFacts | undefined;
}): AssetNormalizationRepository {
  const calls: string[] = [];
  const fake = {
    calls,
    findAssociation: (kind: string, id: string) => {
      calls.push(`findAssociation:${kind}:${id}`);
      return Promise.resolve(options.association);
    },
    findSource: (assetId: string) => {
      calls.push(`findSource:${assetId}`);
      return Promise.resolve(options.asset);
    },
    prepareOrRecover: () => Promise.reject(new Error('not used')),
    finalizeReady: () => Promise.resolve(undefined),
    failClaim: () => Promise.resolve(undefined),
    findNormalized: () => Promise.resolve(undefined),
  } as unknown as AssetNormalizationRepository & { calls: string[] };
  return fake;
}

const codeOf = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

const active = { assetId: ASSET, active: true } as const;

describe('the mapping', () => {
  it('is exactly the three ruled pairs', () => {
    expect(PROFILE_BY_ASSOCIATION).toEqual({
      PRODUCT_SIDE_BACKGROUND: 'SIDE_BACKGROUND',
      DESIGN_TEMPLATE_ASSET: 'TEMPLATE_ASSET',
      DESIGN_SESSION_ASSET: 'SESSION_UPLOAD',
    });
  });

  it('derives each profile from its own association and lane', () => {
    const cases = [
      ['PRODUCT_SIDE_BACKGROUND', 'SIDE_BACKGROUND', 'CATALOG_MEDIA'],
      ['DESIGN_TEMPLATE_ASSET', 'TEMPLATE_ASSET', 'TEMPLATE_SOURCE'],
      ['DESIGN_SESSION_ASSET', 'SESSION_UPLOAD', 'CUSTOMER_UPLOAD'],
    ] as const;

    return Promise.all(
      cases.map(async ([kind, profile, lane]) => {
        const service = new AssociationResolutionService(
          repository({ association: active, asset: source({ kind: lane }) }),
        );
        const resolved = await service.resolve(ASSET, referenceOf(kind));
        expect(resolved.profile).toBe(profile);
      }),
    );
  });
});

describe('a context that has moved', () => {
  it('refuses a missing association', async () => {
    const service = new AssociationResolutionService(
      repository({ association: undefined, asset: source() }),
    );
    expect(await codeOf(() => service.resolve(ASSET, sideReference()))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });

  it('refuses an association that now points at another Asset', async () => {
    // The re-point is invisible in the payload: only the association's own
    // `asset_id` can reveal it.
    const service = new AssociationResolutionService(
      repository({ association: { assetId: 'other', active: true }, asset: source() }),
    );
    expect(await codeOf(() => service.resolve(ASSET, sideReference()))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });

  it('refuses a retired, archived or terminal owner', async () => {
    const service = new AssociationResolutionService(
      repository({ association: { assetId: ASSET, active: false }, asset: source() }),
    );
    expect(await codeOf(() => service.resolve(ASSET, sideReference()))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });

  it('refuses an Asset that is gone, tombstoned or not yet accepted', async () => {
    for (const asset of [
      undefined,
      source({ deleted: true }),
      source({ status: 'INSPECTING' }),
      source({ status: 'REJECTED' }),
    ]) {
      const service = new AssociationResolutionService(repository({ association: active, asset }));
      expect(await codeOf(() => service.resolve(ASSET, sideReference()))).toBe(
        'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
      );
    }
  });

  it('keeps a Template Asset terminal while it is still inspecting', async () => {
    // The `APP3-W01C` retry is Session-only. A Template association's Asset is
    // associated long after inspection, so an `INSPECTING` one is a real stale
    // context and waiting for it would loop to the dead-letter for nothing.
    const service = new AssociationResolutionService(
      repository({
        association: active,
        asset: source({ status: 'INSPECTING', kind: 'TEMPLATE_SOURCE' }),
      }),
    );
    expect(await codeOf(() => service.resolve(ASSET, referenceOf('DESIGN_TEMPLATE_ASSET')))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });
});

describe('a Session upload whose inspection has not finished (`APP3-W01C`)', () => {
  const sessionSource = (overrides: Partial<NormalizationSourceFacts> = {}) =>
    source({ kind: 'CUSTOMER_UPLOAD', classification: 'CUSTOMER_PRIVATE', ...overrides });

  const resolveSession = (asset: NormalizationSourceFacts | undefined) =>
    new AssociationResolutionService(repository({ association: active, asset })).resolve(
      ASSET,
      referenceOf('DESIGN_SESSION_ASSET'),
    );

  it('is a retryable attempt failure, not a verdict about the request', async () => {
    // The distinction is the whole checkpoint: a verdict completes the job and
    // the derivative is never produced, a failed attempt goes back to the
    // runtime's existing backoff.
    await expect(resolveSession(sessionSource({ status: 'INSPECTING' }))).rejects.toMatchObject({
      name: 'WorkerJobError',
      errorClass: 'JOB_TRANSIENT_FAILURE',
    });
  });

  it('is not a NormalizationRejection, so nothing records a terminal outcome', async () => {
    expect(await codeOf(() => resolveSession(sessionSource({ status: 'INSPECTING' })))).not.toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
    await expect(
      resolveSession(sessionSource({ status: 'INSPECTING' })),
    ).rejects.not.toBeInstanceOf(NormalizationRejection);
  });

  it('retries under the existing policy and dead-letters at the cap', () => {
    // No new retry mechanism: the class alone decides, through the runtime
    // function that already governs every other handler.
    expect(dispositionOf('JOB_TRANSIENT_FAILURE', 1, 5)).toBe('RETRYABLE');
    expect(dispositionOf('JOB_TRANSIENT_FAILURE', 5, 5)).toBe('TERMINAL');
  });

  it('names no asset, session, association or storage identity', async () => {
    try {
      await resolveSession(sessionSource({ status: 'INSPECTING' }));
    } catch (error: unknown) {
      const message = (error as Error).message;
      for (const secret of [ASSET, ASSOCIATION, 'storage', 'originals']) {
        expect(message).not.toContain(secret);
      }
    }
  });

  it('proceeds normally once inspection has accepted the Asset', async () => {
    const resolved = await resolveSession(sessionSource({ status: 'ACCEPTED' }));
    expect(resolved.profile).toBe('SESSION_UPLOAD');
  });

  it('is terminal for every state that is not a pending inspection', async () => {
    for (const asset of [
      undefined,
      sessionSource({ deleted: true }),
      sessionSource({ status: 'REJECTED' }),
      sessionSource({ status: 'DELETION_PENDING' }),
      sessionSource({ status: 'DELETED' }),
    ]) {
      expect(await codeOf(() => resolveSession(asset))).toBe(
        'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
      );
    }
  });

  it('does not wait on `UPLOADED`, which a committed request cannot observe', async () => {
    // The producer appends the event in the transaction that leaves `UPLOADED`,
    // so admitting it would turn a real defect into a silent retry loop.
    expect(SESSION_TRANSIENT_ASSET_STATUSES).toEqual(['INSPECTING']);
    expect(await codeOf(() => resolveSession(sessionSource({ status: 'UPLOADED' })))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });

  it('stays terminal when the Asset is in the wrong lane, however it is inspected', async () => {
    expect(
      await codeOf(() =>
        resolveSession(sessionSource({ status: 'INSPECTING', kind: 'CATALOG_MEDIA' })),
      ),
    ).toBe('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
  });

  it('stays terminal when the association itself has gone', async () => {
    const service = new AssociationResolutionService(
      repository({ association: undefined, asset: sessionSource({ status: 'INSPECTING' }) }),
    );
    expect(await codeOf(() => service.resolve(ASSET, referenceOf('DESIGN_SESSION_ASSET')))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });

  it('refuses an Asset from another intake lane', async () => {
    // A Template association pointing at a customer upload: valid rows, wrong
    // lane. Nothing about the bytes was examined, so it is a context failure.
    const service = new AssociationResolutionService(
      repository({ association: active, asset: source({ kind: 'CUSTOMER_UPLOAD' }) }),
    );
    expect(await codeOf(() => service.resolve(ASSET, referenceOf('DESIGN_TEMPLATE_ASSET')))).toBe(
      'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
    );
  });

  it('reports one code, revealing nothing about which row failed', async () => {
    const service = new AssociationResolutionService(
      repository({ association: undefined, asset: source() }),
    );
    try {
      await service.resolve(ASSET, sideReference());
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).not.toContain(ASSET);
      expect(message).not.toContain(ASSOCIATION);
      expect(message).not.toContain('storage');
    }
  });
});

describe('what it never does', () => {
  it('looks the association up by its own id, never by Asset', async () => {
    const repo = repository({ association: active, asset: source() });
    const service = new AssociationResolutionService(repo);
    await service.resolve(ASSET, sideReference());

    const calls = (repo as unknown as { calls: string[] }).calls;
    expect(calls[0]).toBe(`findAssociation:PRODUCT_SIDE_BACKGROUND:${ASSOCIATION}`);
    // No "find associations for asset" call exists on the port at all, so a
    // scan-and-choose implementation could not be written without changing it.
    expect(Object.keys(repo)).not.toContain('findAssociationsForAsset');
  });

  it('takes the profile from the association, never from a payload field', async () => {
    // The reference type has no profile slot; this asserts the derived value is
    // the mapped one even when the Asset's media type would suggest another.
    const service = new AssociationResolutionService(
      repository({
        association: active,
        asset: source({ mediaType: 'image/svg+xml', kind: 'TEMPLATE_SOURCE' }),
      }),
    );
    const resolved = await service.resolve(ASSET, referenceOf('DESIGN_TEMPLATE_ASSET'));
    expect(resolved.profile).toBe('TEMPLATE_ASSET');
  });

  it('exposes a rejection as data, not as a worker failure', () => {
    const rejection = normalizationRejection('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
    expect(rejection.code).toBe('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
    expect(rejection.name).toBe('NormalizationRejection');
  });
});

function sideReference() {
  return { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: ASSOCIATION } as const;
}

function referenceOf(
  kind: 'PRODUCT_SIDE_BACKGROUND' | 'DESIGN_TEMPLATE_ASSET' | 'DESIGN_SESSION_ASSET',
) {
  if (kind === 'PRODUCT_SIDE_BACKGROUND') return sideReference();
  if (kind === 'DESIGN_TEMPLATE_ASSET') {
    return { kind, designTemplateAssetId: ASSOCIATION } as const;
  }
  return { kind, designSessionAssetId: ASSOCIATION } as const;
}
