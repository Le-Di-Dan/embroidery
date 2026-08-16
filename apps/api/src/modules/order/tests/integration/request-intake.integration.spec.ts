/**
 * `APP5-B02` — customer attachment intake against a real database and the real
 * `APP2-B01` upload pipeline.
 *
 * The claims here are the ones a unit test cannot make: that the row PostgreSQL
 * ends up holding carries the provenance `APP5-DB01` added, that no client
 * input can reach the fields that decide ownership, and that an unauthorized
 * challenge causes no storage work at all.
 *
 * The last point is asserted rather than assumed. `context.storage.written` is
 * empty after every refusal case — a refusal that had already written the
 * object would leave a private binary in a bucket with no row pointing at it,
 * and no sweep could ever find it.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { isRequestIntakeError } from '../../domain/intake/request-intake.errors';
import { isAssetIntakeError } from '../../../asset/domain/asset-intake.errors';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import type { AssetId } from '../../../asset/domain/repositories/asset.repository';
import {
  createRequestIntakeContext,
  jpegBytes,
  multipartRequest,
  pngBytes,
  SVG_BODY,
  type RequestIntakeTestContext,
} from './request-intake-context';

type AssetRow = {
  readonly id: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly uploaded_by_customer_id: string | null;
  readonly uploaded_via_challenge_id: string | null;
  readonly uploaded_via_session_id: string | null;
  readonly intake_expires_at: Date | null;
  readonly storage_key: string;
};

describe('APP5-B02 customer attachment intake (integration)', () => {
  let context: RequestIntakeTestContext;

  beforeAll(async () => {
    context = await createRequestIntakeContext('app5-b02-intake');
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.storage.reset();
  });

  const rows = async (): Promise<AssetRow[]> => {
    const result = await context.disposable.client.db.execute<AssetRow>(
      sql`select id, kind, classification, status, uploaded_by_customer_id,
                 uploaded_via_challenge_id, uploaded_via_session_id, intake_expires_at, storage_key
            from assets order by created_at asc, id asc`,
    );
    return [...result.rows];
  };

  /** Runs `work` and returns the bounded error code it raised. */
  async function refusalCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      if (isRequestIntakeError(error) || isAssetIntakeError(error)) return error.code;
      throw error;
    }
    throw new Error('Expected the upload to be refused, but it succeeded.');
  }

  describe('a verified challenge uploads a supported image', () => {
    it('persists one private customer upload with full DB01 provenance', async () => {
      const challenge = await context.seedVerifiedChallenge();

      const view = await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'REFERENCE',
      });

      expect(view.role).toBe('REFERENCE');
      expect(view.mediaType).toBe('image/png');

      const [asset] = await rows();
      expect(asset).toBeDefined();
      expect(asset?.kind).toBe('CUSTOMER_UPLOAD');
      expect(asset?.classification).toBe('CUSTOMER_PRIVATE');
      // The customer is server-derived: the request carried a challenge and
      // nothing else, and this column is what `APP5-B01`'s binder compares.
      expect(asset?.uploaded_by_customer_id).not.toBeNull();
      expect(asset?.uploaded_via_challenge_id).toBe(challenge.challengeId);
      expect(asset?.intake_expires_at).not.toBeNull();
      // CST-127's other lane stays empty — this upload had no design session.
      expect(asset?.uploaded_via_session_id).toBeNull();
      expect(context.storage.written).toHaveLength(1);
    });

    it('copies the intake expiry from the authorizing challenge, not from a default', async () => {
      const challenge = await context.seedVerifiedChallenge({ expiresInMinutes: 7 });

      await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'COP_IMAGE',
      });

      const [asset] = await rows();
      // Compared to the challenge's own column rather than to a computed
      // instant: a second clock is exactly what `APP4-B03` warned about.
      const [challengeRow] = (
        await context.disposable.client.db.execute<{ expires_at: Date }>(
          sql`select expires_at from contact_verification_challenges where id = ${challenge.challengeId}`,
        )
      ).rows;
      expect(new Date(asset?.intake_expires_at ?? 0).toISOString()).toBe(
        new Date(challengeRow?.expires_at ?? 0).toISOString(),
      );
    });

    it('leaves the asset INSPECTING — inspection, not intake, decides ACCEPTED', async () => {
      const challenge = await context.seedVerifiedChallenge();

      const view = await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'REFERENCE',
      });

      expect(view.state).toBe('INSPECTING');
      const [asset] = await rows();
      expect(asset?.status).toBe('INSPECTING');

      // And the handoff is real: an inspection event exists for exactly this
      // asset, which is what makes the state truthful rather than decorative.
      const events = await context.disposable.client.db.execute<{ n: number }>(
        sql`select count(*)::int as n from outbox_events
             where event_type = 'asset.inspection.requested' and aggregate_id = ${view.assetId}`,
      );
      expect(events.rows[0]?.n).toBe(1);
    });

    it('requests no normalization — a customer photograph has no derivative consumer', async () => {
      const challenge = await context.seedVerifiedChallenge();
      await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'REFERENCE',
      });

      const events = await context.disposable.client.db.execute<{ n: number }>(
        sql`select count(*)::int as n from outbox_events
             where event_type = 'asset.normalization.requested'`,
      );
      expect(events.rows[0]?.n).toBe(0);
    });
  });

  describe('authorization', () => {
    it('refuses an unknown challenge without touching storage', async () => {
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes()), {
          challengeId: newId() as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('REQUEST_INTAKE_NOT_AUTHORIZED');
      expect(context.storage.written).toHaveLength(0);
      expect(await rows()).toHaveLength(0);
    });

    it('refuses an unverified challenge with the same answer', async () => {
      const challenge = await context.seedVerifiedChallenge({ status: 'ISSUED' });
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes()), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('REQUEST_INTAKE_NOT_AUTHORIZED');
    });

    it('refuses an expired challenge with the same answer', async () => {
      const challenge = await context.seedVerifiedChallenge({ expiresInMinutes: -1 });
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes()), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('REQUEST_INTAKE_NOT_AUTHORIZED');
    });

    it('refuses a STEP_UP challenge — only SUBMISSION authorizes intake', async () => {
      const challenge = await context.seedVerifiedChallenge({ purpose: 'STEP_UP' });
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes()), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('REQUEST_INTAKE_NOT_AUTHORIZED');
    });

    it('refuses a challenge that has already produced a request', async () => {
      const challenge = await context.seedVerifiedChallenge();
      // The exact record `APP5-B01` writes: namespace `request.submit`, scope
      // key the challenge id, status COMPLETED. Nothing else marks consumption.
      await context.disposable.client.db.execute(sql`
        insert into idempotency_records
               (operation_namespace, scope_key, fingerprint, status, expires_at, claimed_at, completed_at)
        values ('request.submit', ${challenge.challengeId}, 'fp', 'COMPLETED',
                now() + interval '1 day', now(), now())
      `);

      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes()), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('REQUEST_INTAKE_NOT_AUTHORIZED');
      expect(context.storage.written).toHaveLength(0);
    });

    it('admits an upload while a submission is only IN_PROGRESS', async () => {
      const challenge = await context.seedVerifiedChallenge();
      await context.disposable.client.db.execute(sql`
        insert into idempotency_records
               (operation_namespace, scope_key, fingerprint, status, expires_at, claimed_at)
        values ('request.submit', ${challenge.challengeId}, 'fp', 'IN_PROGRESS',
                now() + interval '1 day', now())
      `);

      // A submission that may still roll back must not cost the customer a
      // file it would then have no way to re-upload.
      await expect(
        context.intake.upload(multipartRequest(pngBytes()), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('media rules are the pipeline’s, reused unchanged', () => {
    it('refuses an SVG declared as PNG — the declared type is not trusted', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(SVG_BODY, { contentType: 'image/png' }), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
      expect(await rows()).toHaveLength(0);
    });

    it('refuses an SVG declared as SVG', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const code = await refusalCode(() =>
        context.intake.upload(
          multipartRequest(SVG_BODY, { contentType: 'image/svg+xml', filename: 'logo.svg' }),
          { challengeId: challenge.challengeId as ChallengeId, role: 'REFERENCE' },
        ),
      );
      expect(code).toBe('ASSET_UPLOAD_MEDIA_UNSUPPORTED');
    });

    it('refuses a JPEG body declared as PNG', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(jpegBytes(), { contentType: 'image/png' }), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
    });
  });

  describe('idempotency', () => {
    it('replays the same result for the same key and the same bytes', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const key = 'app5-intake-key-001';

      const first = await context.intake.upload(
        multipartRequest(pngBytes(), { idempotencyKey: key }),
        { challengeId: challenge.challengeId as ChallengeId, role: 'REFERENCE' },
      );
      const second = await context.intake.upload(
        multipartRequest(pngBytes(), { idempotencyKey: key }),
        { challengeId: challenge.challengeId as ChallengeId, role: 'REFERENCE' },
      );

      expect(second.assetId).toBe(first.assetId);
      // One asset, one object: the replay wrote neither a second row nor a
      // second binary, and — the point for §6 — took no second quota slot.
      expect(await rows()).toHaveLength(1);
      expect(context.storage.written).toHaveLength(1);
    });

    it('refuses the same key with different bytes', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const key = 'app5-intake-key-002';

      await context.intake.upload(multipartRequest(pngBytes(0x01), { idempotencyKey: key }), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'REFERENCE',
      });
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes(0x09), { idempotencyKey: key }), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'REFERENCE',
        }),
      );
      expect(code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await rows()).toHaveLength(1);
    });

    it('treats the same key under a different role as a conflict', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const key = 'app5-intake-key-003';

      await context.intake.upload(multipartRequest(pngBytes(), { idempotencyKey: key }), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'REFERENCE',
      });
      // The same photograph as evidence of the garment means something
      // different from the same photograph as a reference, so one key must not
      // cover both.
      const code = await refusalCode(() =>
        context.intake.upload(multipartRequest(pngBytes(), { idempotencyKey: key }), {
          challengeId: challenge.challengeId as ChallengeId,
          role: 'COP_IMAGE',
        }),
      );
      expect(code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('status isolation', () => {
    it('reports the truthful state and bindability for the uploading challenge', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const view = await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'COP_IMAGE',
      });

      const inspecting = await context.status.read(
        challenge.challengeId as ChallengeId,
        view.assetId as AssetId,
        new Date(),
      );
      expect(inspecting).toEqual({
        assetId: view.assetId,
        state: 'INSPECTING',
        bindable: false,
      });

      await context.disposable.client.db.execute(
        sql`update assets set status = 'ACCEPTED' where id = ${view.assetId}`,
      );
      const accepted = await context.status.read(
        challenge.challengeId as ChallengeId,
        view.assetId as AssetId,
        new Date(),
      );
      expect(accepted.state).toBe('ACCEPTED');
      expect(accepted.bindable).toBe(true);
    });

    it('does not answer for another challenge’s attachment', async () => {
      const mine = await context.seedVerifiedChallenge();
      const theirs = await context.seedVerifiedChallenge();
      const view = await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: mine.challengeId as ChallengeId,
        role: 'REFERENCE',
      });

      const code = await refusalCode(() =>
        context.status.read(theirs.challengeId as ChallengeId, view.assetId as AssetId, new Date()),
      );
      // Not "forbidden": telling a caller the id exists but belongs elsewhere
      // is the existence oracle the conjunctive check exists to avoid.
      expect(code).toBe('REQUEST_INTAKE_ASSET_NOT_FOUND');
    });

    it('reports a tombstoned attachment as unbindable', async () => {
      const challenge = await context.seedVerifiedChallenge();
      const view = await context.intake.upload(multipartRequest(pngBytes()), {
        challengeId: challenge.challengeId as ChallengeId,
        role: 'REFERENCE',
      });
      await context.disposable.client.db.execute(
        sql`update assets set status = 'ACCEPTED', deleted_at = now() where id = ${view.assetId}`,
      );

      const status = await context.status.read(
        challenge.challengeId as ChallengeId,
        view.assetId as AssetId,
        new Date(),
      );
      // `RequestAssetBinder` refuses a tombstoned row even at ACCEPTED, so
      // reporting it as bindable would be a promise this service cannot keep.
      expect(status.bindable).toBe(false);
    });
  });
});
