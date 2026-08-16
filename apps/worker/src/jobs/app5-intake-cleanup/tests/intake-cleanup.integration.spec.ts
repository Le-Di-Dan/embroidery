/**
 * `APP5-B02` §7.4 — the APP5 intake cleanup sweep against real PostgreSQL.
 *
 * Six eligibility claims and one lifecycle claim. The eligibility half is
 * where a retention job earns trust or loses it: every case here is a row the
 * sweep must *not* touch, seeded next to one it must, so a predicate that
 * quietly widened would fail rather than pass with fewer rows left over.
 *
 * The load-bearing case is "the challenge was hard-deleted". `REL-106` is
 * `ON DELETE SET NULL`, so the moment a challenge is TTL-swept every asset it
 * authorized loses its challenge id — and that is exactly the moment cleanup
 * becomes necessary. A sweep keyed on `uploaded_via_challenge_id` would go
 * blind at precisely the wrong instant; this one is keyed on
 * `intake_expires_at`, which survives.
 *
 * Only `IntakeCleanupModule` is booted, not the whole `WorkerModule`: this job
 * registers no handler and claims no outbox event, so the poll runtime is not
 * part of what is being proved and booting it would only add a startup gate.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
// The sanctioned raw-SQL boundary (ADR-DB1-002): the worker application must
// never depend on the ORM or the driver, not even in a test.
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import { IntakeCleanupModule } from '../intake-cleanup.module';
import { IntakeCleanupUseCase } from '../application/intake-cleanup.usecase';

const OFFLINE_STORAGE_ENV: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://app5-cleanup.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'app5-cleanup',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'app5-cleanup',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'app5-cleanup-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'app5-cleanup-derivatives',
};

const CHECKSUM = `sha256:${'c'.repeat(64)}`;

/** Records deletions so the two phases are observable without a real store. */
class RecordingStorage {
  readonly deleted: string[] = [];
  failNext = false;

  deleteObject(reference: { readonly key: string }): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('object store refused the deletion'));
    }
    this.deleted.push(reference.key);
    return Promise.resolve();
  }

  reset(): void {
    this.deleted.length = 0;
    this.failNext = false;
  }
}

interface AssetState {
  readonly status: string;
  readonly deletion_requested_at: Date | null;
  readonly deleted_at: Date | null;
  readonly deletion_reason: string | null;
}

describe('APP5-B02 intake cleanup (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let cleanup: IntakeCleanupUseCase;
  let storage: RecordingStorage;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const previous = new Map<string, string | undefined>();
    for (const [name, value] of Object.entries(OFFLINE_STORAGE_ENV)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }

    disposable = await createDisposableDatabase('app5-b02-cleanup');
    const previousUrl = process.env['DATABASE_URL'];
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    restoreEnv = (): void => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (previousUrl === undefined) delete process.env['DATABASE_URL'];
      else process.env['DATABASE_URL'] = previousUrl;
      if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = previousNodeEnv;
    };

    storage = new RecordingStorage();
    moduleRef = await Test.createTestingModule({ imports: [IntakeCleanupModule] })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile();
    // `init()` is deliberately not called: it would start the sweep's own
    // schedule, and every case here drives one pass explicitly so the assertion
    // is about what a pass does rather than about when it happened.
    cleanup = moduleRef.get(IntakeCleanupUseCase);
  }, 240_000);

  afterAll(async () => {
    await moduleRef?.close();
    await disposable?.drop();
    restoreEnv?.();
  });

  beforeEach(async () => {
    await executeRaw(
      disposable.client.db,
      sql`truncate custom_request_assets, custom_requests, assets,
                   contact_verification_challenges, customer_contact_points, customers cascade`,
    );
    storage.reset();
  });

  /** A verified `SUBMISSION` challenge with an already-past expiry. */
  async function seedChallenge(expiresInMinutes: number): Promise<string> {
    const id = newId();
    await executeRaw(
      disposable.client.db,
      sql`insert into contact_verification_challenges
                 (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
          values (${id}, 'EMAIL', ${`cleanup-${id}@example.test`}, 'SUBMISSION', ${`hash-${id}`},
                  'VERIFIED', now() + ${`${expiresInMinutes} minutes`}::interval, now())`,
    );
    return id;
  }

  interface SeedAssetOptions {
    readonly challengeId?: string | undefined;
    readonly expiresInMinutes?: number | undefined;
    readonly status?: string;
    readonly kind?: string;
    readonly classification?: string;
  }

  async function seedAsset(options: SeedAssetOptions = {}): Promise<string> {
    const id = newId();
    const expiry =
      options.expiresInMinutes === undefined
        ? sql`null`
        : sql`now() + ${`${options.expiresInMinutes} minutes`}::interval`;
    await executeRaw(
      disposable.client.db,
      sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                              checksum, status, uploaded_via_challenge_id, intake_expires_at)
          values (${id}, ${options.kind ?? 'CUSTOMER_UPLOAD'},
                  ${options.classification ?? 'CUSTOMER_PRIVATE'},
                  ${`intake/${id}/original.png`}, 'image/png', 2048, ${CHECKSUM},
                  ${options.status ?? 'ACCEPTED'}, ${options.challengeId ?? null}, ${expiry})`,
    );
    return id;
  }

  /** Binds an asset to a request, which is what makes it retained evidence. */
  async function bindToRequest(assetId: string): Promise<void> {
    const customerId = newId();
    const requestId = newId();
    await executeRaw(
      disposable.client.db,
      sql`insert into customers (id, display_name, verified_at)
          values (${customerId}, 'Cleanup Customer', now())`,
    );
    await executeRaw(
      disposable.client.db,
      sql`insert into custom_requests (id, code, customer_id, status)
          values (${requestId}, ${`REQ-${requestId.slice(0, 10)}`}, ${customerId}, 'NEW')`,
    );
    await executeRaw(
      disposable.client.db,
      sql`insert into custom_request_assets (id, custom_request_id, asset_id, role)
          values (${newId()}, ${requestId}, ${assetId}, 'REFERENCE')`,
    );
  }

  async function stateOf(assetId: string): Promise<AssetState> {
    const rows = await executeRaw<AssetState>(
      disposable.client.db,
      sql`select status, deletion_requested_at, deleted_at, deletion_reason
            from assets where id = ${assetId}`,
    );
    return rows[0] as AssetState;
  }

  it('sweeps an expired, unbound intake asset through both phases', async () => {
    const challengeId = await seedChallenge(-10);
    const assetId = await seedAsset({ challengeId, expiresInMinutes: -10 });

    const outcome = await cleanup.run();

    expect(outcome).toEqual({ marked: 1, removed: 1, deferred: 0 });
    const state = await stateOf(assetId);
    expect(state.status).toBe('DELETED');
    expect(state.deletion_requested_at).not.toBeNull();
    expect(state.deleted_at).not.toBeNull();
    expect(state.deletion_reason).toContain('APP5 intake window expired');
    expect(storage.deleted).toHaveLength(1);
  });

  it('leaves an unexpired intake asset alone', async () => {
    const challengeId = await seedChallenge(30);
    const assetId = await seedAsset({ challengeId, expiresInMinutes: 30 });

    expect(await cleanup.run()).toEqual({ marked: 0, removed: 0, deferred: 0 });
    expect((await stateOf(assetId)).status).toBe('ACCEPTED');
    expect(storage.deleted).toHaveLength(0);
  });

  it('leaves a request-bound asset alone even when its window has expired', async () => {
    const challengeId = await seedChallenge(-10);
    const bound = await seedAsset({ challengeId, expiresInMinutes: -10 });
    await bindToRequest(bound);

    // Submitted evidence is retained with the request; its intake window
    // stopped governing its life the moment `APP5-B01` bound it.
    expect(await cleanup.run()).toEqual({ marked: 0, removed: 0, deferred: 0 });
    expect((await stateOf(bound)).status).toBe('ACCEPTED');
  });

  it('leaves other asset lanes alone', async () => {
    // Both are expired by `intake_expires_at`, which no other lane sets — but
    // if one ever did, the lane scope is what stops this sweep deleting it.
    const catalog = await seedAsset({
      expiresInMinutes: -10,
      kind: 'CATALOG_MEDIA',
      classification: 'PUBLIC',
    });
    const production = await seedAsset({
      expiresInMinutes: -10,
      kind: 'PRODUCTION_FILE',
      classification: 'PRODUCTION_SENSITIVE',
    });

    expect(await cleanup.run()).toEqual({ marked: 0, removed: 0, deferred: 0 });
    expect((await stateOf(catalog)).status).toBe('ACCEPTED');
    expect((await stateOf(production)).status).toBe('ACCEPTED');
  });

  it('leaves an asset with no intake expiry alone', async () => {
    // Every APP1–APP4 asset looks like this, and none of them is this sweep's.
    const legacy = await seedAsset({});
    expect(await cleanup.run()).toEqual({ marked: 0, removed: 0, deferred: 0 });
    expect((await stateOf(legacy)).status).toBe('ACCEPTED');
  });

  it('still finds an asset whose challenge was hard-deleted', async () => {
    const challengeId = await seedChallenge(-10);
    const assetId = await seedAsset({ challengeId, expiresInMinutes: -10 });

    // The real TTL deletion of the parent. REL-106 nulls the pointer; the
    // expiry is what survives, and it is what this sweep is keyed on.
    await executeRaw(
      disposable.client.db,
      sql`delete from contact_verification_challenges where id = ${challengeId}`,
    );
    const orphaned = await executeRaw<{ uploaded_via_challenge_id: string | null }>(
      disposable.client.db,
      sql`select uploaded_via_challenge_id from assets where id = ${assetId}`,
    );
    expect(orphaned[0]?.uploaded_via_challenge_id).toBeNull();

    expect(await cleanup.run()).toEqual({ marked: 1, removed: 1, deferred: 0 });
    expect((await stateOf(assetId)).status).toBe('DELETED');
  });

  it('holds a row at DELETION_PENDING when the object store refuses', async () => {
    const challengeId = await seedChallenge(-10);
    const assetId = await seedAsset({ challengeId, expiresInMinutes: -10 });
    storage.failNext = true;

    const first = await cleanup.run();
    expect(first).toEqual({ marked: 1, removed: 0, deferred: 1 });

    const pending = await stateOf(assetId);
    // Phase 1 stands: the intent is durable, and `deleted_at` is still null
    // because it means "the binary is confirmed deleted" and nothing else.
    expect(pending.status).toBe('DELETION_PENDING');
    expect(pending.deletion_requested_at).not.toBeNull();
    expect(pending.deleted_at).toBeNull();

    // The next pass finishes it without re-marking — `marked` is 0 because the
    // row is already out of the eligibility set.
    const second = await cleanup.run();
    expect(second).toEqual({ marked: 0, removed: 1, deferred: 0 });
    expect((await stateOf(assetId)).status).toBe('DELETED');
  });

  it('is a no-op on a second pass over an already-swept row', async () => {
    const challengeId = await seedChallenge(-10);
    await seedAsset({ challengeId, expiresInMinutes: -10 });

    await cleanup.run();
    expect(await cleanup.run()).toEqual({ marked: 0, removed: 0, deferred: 0 });
    expect(storage.deleted).toHaveLength(1);
  });
});
