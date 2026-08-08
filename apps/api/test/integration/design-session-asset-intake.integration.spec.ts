/**
 * Session raster intake against live PostgreSQL and live object storage
 * (`APP3-B06B-C1`).
 *
 * `APP3-B06B` shipped with its durable claims proved only structurally. This is
 * the missing half: every assertion below reads a real row, a real event or a
 * real object, through the real HTTP pipeline over a real multipart body.
 *
 * The cases chosen are the ones no unit test can reach — that the association is
 * unique because the database says so, that a rollback leaves *nothing* rather
 * than leaving a plausible-looking half, that a replay converges on the same
 * association id, and that the persisted event/state pair is the one `W01C`
 * expects to find.
 */
import { randomUUID } from 'node:crypto';

import { sql } from '@embroidery/database';
import {
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_POLICY_VERSION,
} from '@embroidery/domain-types';
import { OutboxEventStore } from '@embroidery/persistence';

import { ASSET_INSPECTION_EVENT_TYPE } from '../../src/modules/asset/domain/asset-intake.policy';
import { SESSION_UPLOAD_OPERATION_NAMESPACE } from '../../src/modules/design/domain/session-asset-intake.policy';
import {
  createSessionAssetContext,
  DESIGN_SESSION_TEST_ORIGIN,
  type SessionAssetTestContext,
} from '../support/design-session-asset-context';
import { jpegBytes, pngBytes, randomNonImageBytes, webpBytes } from '../support/synthetic-images';

const REVISION_HEADER = 'x-design-session-revision';

interface IntakeView {
  assetId: string;
  designSessionAssetId: string;
  sessionRevision: number;
  assetStatus: string;
  mediaType: string;
  byteSize: number;
}

describe('Design Session raster intake (live PostgreSQL + object storage)', () => {
  let ctx: SessionAssetTestContext;

  beforeAll(async () => {
    ctx = await createSessionAssetContext('app3b06b-session-asset');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  beforeEach(() => ctx.limiter.reset());

  const rows = <T>(statement: ReturnType<typeof sql>) => ctx.rows<T>(statement);

  const countOf = async (statement: ReturnType<typeof sql>): Promise<number> => {
    const [row] = await rows<{ count: string }>(statement);
    return Number(row?.count ?? '-1');
  };

  /** One multipart upload, fully parameterised. */
  const upload = (
    sessionId: string,
    options: {
      bytes?: Buffer;
      contentType?: string;
      filename?: string;
      cookie?: string;
      key?: string;
      revision?: string;
    } = {},
  ) =>
    ctx.api.http
      .post(`/api/public/design-sessions/${sessionId}/assets`)
      .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', options.cookie ?? ctx.cookieFor(sessionId))
      .set('Idempotency-Key', options.key ?? randomUUID())
      .set(REVISION_HEADER, options.revision ?? '0')
      .attach('file', options.bytes ?? pngBytes(2048, 7), {
        filename: options.filename ?? 'upload.png',
        contentType: options.contentType ?? 'image/png',
      });

  const dataOf = (response: { body: unknown }): IntakeView =>
    (response.body as { data: IntakeView }).data;

  const associationsOf = (sessionId: string) =>
    rows<{ id: string; asset_id: string }>(
      sql`select id, asset_id from design_session_assets where session_id = ${sessionId}`,
    );

  const eventsOf = (assetId: string, eventType: string) =>
    rows<{ id: string; payload: Record<string, unknown>; payload_schema_version: number }>(
      sql`select id, payload, payload_schema_version from outbox_events
          where aggregate_id = ${assetId} and event_type = ${eventType}`,
    );

  const assetRowOf = (assetId: string) =>
    rows<{
      status: string;
      kind: string;
      classification: string;
      storage_key: string;
      mime_type: string;
      size_bytes: string;
    }>(
      sql`select status, kind, classification, storage_key, mime_type, size_bytes
          from assets where id = ${assetId}`,
    );

  const revisionOf = async (sessionId: string): Promise<number> => {
    const [row] = await rows<{ autosave_revision: number }>(
      sql`select autosave_revision from design_sessions where id = ${sessionId}`,
    );
    return row?.autosave_revision ?? -1;
  };

  describe('the happy path', () => {
    it('accepts a PNG and leaves exactly one of everything', async () => {
      const sessionId = await ctx.seedSession();
      const response = await upload(sessionId).expect(202);
      const view = dataOf(response);

      // §5.5 — the durable status is INSPECTING, never ACCEPTED.
      const [asset] = await assetRowOf(view.assetId);
      expect(asset?.status).toBe('INSPECTING');
      expect(asset?.kind).toBe('CUSTOMER_UPLOAD');
      expect(asset?.classification).toBe('CUSTOMER_PRIVATE');

      // §5.4 — the private object really exists at the recorded key.
      const head = await ctx.storage.headObject({
        bucket: 'ORIGINALS',
        key: asset?.storage_key ?? '',
      });
      expect(Number(head.sizeBytes)).toBe(view.byteSize);

      // §5.6/§5.7 — one association, and it is the one that was answered with.
      const associations = await associationsOf(sessionId);
      expect(associations).toHaveLength(1);
      expect(associations[0]?.id).toBe(view.designSessionAssetId);
      expect(associations[0]?.asset_id).toBe(view.assetId);

      // §5.8/§5.9 — exactly one of each event.
      expect(await eventsOf(view.assetId, ASSET_INSPECTION_EVENT_TYPE)).toHaveLength(1);
      const normalization = await eventsOf(view.assetId, ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE);
      expect(normalization).toHaveLength(1);

      // §5.10 — the payload addresses the association that was just created.
      expect(normalization[0]?.payload).toMatchObject({
        assetId: view.assetId,
        normalizationPolicyVersion: ASSET_NORMALIZATION_POLICY_VERSION,
        associationRef: {
          kind: 'DESIGN_SESSION_ASSET',
          designSessionAssetId: view.designSessionAssetId,
        },
      });
      expect(normalization[0]?.payload_schema_version).toBe(
        ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
      );

      // §5.11 — the revision advanced exactly once.
      expect(view.sessionRevision).toBe(1);
      expect(await revisionOf(sessionId)).toBe(1);
    });

    it('accepts a JPEG', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(
        await upload(sessionId, {
          bytes: jpegBytes(2048, 11),
          contentType: 'image/jpeg',
          filename: 'photo.jpg',
        }).expect(202),
      );
      expect(view.mediaType).toBe('image/jpeg');
      const [asset] = await assetRowOf(view.assetId);
      expect(asset?.mime_type).toBe('image/jpeg');
      expect(asset?.status).toBe('INSPECTING');
    });

    it('accepts a WebP', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(
        await upload(sessionId, {
          bytes: webpBytes(2048, 13),
          contentType: 'image/webp',
          filename: 'art.webp',
        }).expect(202),
      );
      expect(view.mediaType).toBe('image/webp');
      const [asset] = await assetRowOf(view.assetId);
      expect(asset?.mime_type).toBe('image/webp');
      expect(await associationsOf(sessionId)).toHaveLength(1);
    });
  });

  describe('replay under the same idempotency key', () => {
    it('converges on the same asset and association, writing nothing twice', async () => {
      const sessionId = await ctx.seedSession();
      const key = `replay-${randomUUID()}`;
      const bytes = pngBytes(4096, 17);

      const first = dataOf(await upload(sessionId, { key, bytes }).expect(202));
      const second = dataOf(await upload(sessionId, { key, bytes }).expect(202));

      // §5.12 — the same durable answer, revision included.
      expect(second).toEqual(first);

      // §5.13/§5.14/§5.15 — nothing was written a second time.
      expect(await associationsOf(sessionId)).toHaveLength(1);
      expect(await eventsOf(first.assetId, ASSET_INSPECTION_EVENT_TYPE)).toHaveLength(1);
      expect(await eventsOf(first.assetId, ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE)).toHaveLength(
        1,
      );

      // §5.16 — and the session advanced once in total, not twice.
      expect(await revisionOf(sessionId)).toBe(1);
      expect(
        await countOf(sql`select count(*)::text as count from assets
                          where kind = 'CUSTOMER_UPLOAD' and id <> ${first.assetId}
                            and id in (select asset_id from design_session_assets
                                       where session_id = ${sessionId})`),
      ).toBe(0);
    });

    it('refuses the same key carrying different bytes', async () => {
      const sessionId = await ctx.seedSession();
      const key = `divergent-${randomUUID()}`;
      const first = dataOf(await upload(sessionId, { key, bytes: pngBytes(2048, 19) }).expect(202));
      await upload(sessionId, { key, bytes: pngBytes(4096, 23) }).expect(409);

      expect(await associationsOf(sessionId)).toHaveLength(1);
      expect(await eventsOf(first.assetId, ASSET_INSPECTION_EVENT_TYPE)).toHaveLength(1);
      expect(await revisionOf(sessionId)).toBe(1);
    });

    it('scopes the key to the session, so the same key in another session is fresh', async () => {
      const mine = await ctx.seedSession();
      const theirs = await ctx.seedSession();
      const key = `shared-${randomUUID()}`;
      const bytes = pngBytes(2048, 29);

      const first = dataOf(await upload(mine, { key, bytes }).expect(202));
      const second = dataOf(await upload(theirs, { key, bytes }).expect(202));

      expect(second.assetId).not.toBe(first.assetId);
      expect(await associationsOf(mine)).toHaveLength(1);
      expect(await associationsOf(theirs)).toHaveLength(1);
    });
  });

  describe('authorization and the revision guard', () => {
    it('refuses a foreign session credential and attaches nothing', async () => {
      const mine = await ctx.seedSession();
      const foreign = await ctx.seedSession();

      // §5.17 — the foreign cookie cannot reach *either* session.
      await upload(mine, { cookie: ctx.cookieFor(foreign) }).expect(401);

      expect(await associationsOf(mine)).toHaveLength(0);
      expect(await associationsOf(foreign)).toHaveLength(0);
      expect(await revisionOf(mine)).toBe(0);
      expect(await revisionOf(foreign)).toBe(0);
    });

    it('refuses an expired session', async () => {
      // §5.18 — expired at the guard, before a byte is read.
      const sessionId = await ctx.seedSession({ expiresIn: '-1 day' });
      await upload(sessionId).expect(401);
      expect(await associationsOf(sessionId)).toHaveLength(0);
    });

    it('refuses a terminal session', async () => {
      const sessionId = await ctx.seedSession({ status: 'EXPIRED' });
      await upload(sessionId).expect(401);
      expect(await associationsOf(sessionId)).toHaveLength(0);
    });

    it('refuses a stale expected revision as a conflict, not a server error', async () => {
      const sessionId = await ctx.seedSession();
      // §5.19 — the published contract promises 409 for a stale revision.
      const response = await upload(sessionId, { revision: '7' });
      expect(response.status).toBe(409);

      // §5.20 — and the refusal left nothing behind.
      expect(await associationsOf(sessionId)).toHaveLength(0);
      expect(await revisionOf(sessionId)).toBe(0);
      expect(
        // `aggregate_id` and the payload reference are `text`; every id column
        // is `uuid`, so the comparison has to be cast, not assumed.
        await countOf(sql`select count(*)::text as count from outbox_events
                          where event_type = ${ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE}
                            and payload -> 'associationRef' ->> 'designSessionAssetId'
                                in (select id::text from design_session_assets
                                    where session_id = ${sessionId})`),
      ).toBe(0);
    });

    it('refuses a malformed revision header', async () => {
      const sessionId = await ctx.seedSession();
      await upload(sessionId, { revision: 'latest' }).expect(400);
      expect(await associationsOf(sessionId)).toHaveLength(0);
    });
  });

  describe('stream and storage failures', () => {
    it('refuses an unsupported type and writes no durable trace', async () => {
      const sessionId = await ctx.seedSession();
      // §5.21 — a signature the allowlist does not contain.
      await upload(sessionId, {
        bytes: randomNonImageBytes(1024),
        contentType: 'application/pdf',
        filename: 'brief.pdf',
      }).expect(415);

      expect(await associationsOf(sessionId)).toHaveLength(0);
      expect(await revisionOf(sessionId)).toBe(0);
    });

    it('refuses bytes whose content contradicts the declared type', async () => {
      const sessionId = await ctx.seedSession();
      await upload(sessionId, {
        bytes: jpegBytes(1024, 31),
        contentType: 'image/png',
        filename: 'liar.png',
      }).expect(415);
      expect(await associationsOf(sessionId)).toHaveLength(0);
    });

    it('aborts a stream over the 10 MiB ceiling', async () => {
      const sessionId = await ctx.seedSession();
      // §5.22 — one byte past the lane maximum.
      const response = await upload(sessionId, { bytes: pngBytes(10_485_761, 37) });
      expect(response.status).toBe(413);

      expect(await associationsOf(sessionId)).toHaveLength(0);
      expect(await revisionOf(sessionId)).toBe(0);
    });

    it('produces no durable intake when storage fails', async () => {
      const sessionId = await ctx.seedSession();
      const uploadedAssets = sql`select count(*)::text as count from assets
                                 where kind = 'CUSTOMER_UPLOAD'`;
      const before = await countOf(uploadedAssets);

      // §5.23 — the object never lands, so nothing downstream may claim it did.
      const failure = jest
        .spyOn(ctx.storage, 'putObjectStream')
        .mockRejectedValueOnce(new Error('storage is gone'));
      try {
        const response = await upload(sessionId);
        expect(response.status).toBeGreaterThanOrEqual(500);
      } finally {
        failure.mockRestore();
      }

      expect(await associationsOf(sessionId)).toHaveLength(0);
      expect(await revisionOf(sessionId)).toBe(0);
      // Counted as a delta, not as an absolute: earlier cases in this file
      // legitimately leave an `UPLOADED` row behind — that is the recovery
      // window the Tx A / Tx B split exists to create. What this asserts is
      // that a failed storage write adds no asset row at all.
      expect(await countOf(uploadedAssets)).toBe(before);
    });
  });

  describe('transaction rollback', () => {
    it('leaves no partial durable state when the second append fails', async () => {
      const sessionId = await ctx.seedSession();
      const outbox = ctx.api.app.get(OutboxEventStore);
      const original = outbox.append.bind(outbox);

      // §5.24 — fail at the normalization append, the last write in Tx B, so
      // everything before it has already succeeded inside the transaction.
      const seam = jest
        .spyOn(outbox, 'append')
        .mockImplementation(async (input: Parameters<typeof original>[0]) => {
          if (input.eventType === ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE) {
            throw new Error('append refused');
          }
          return original(input);
        });

      try {
        const response = await upload(sessionId);
        expect(response.status).toBeGreaterThanOrEqual(500);
      } finally {
        seam.mockRestore();
      }

      // §5.25 — no association, no revision advance, no event of either kind,
      // and no asset left claiming to be under inspection.
      expect(await associationsOf(sessionId)).toHaveLength(0);
      expect(await revisionOf(sessionId)).toBe(0);
      expect(
        await countOf(
          sql`select count(*)::text as count from outbox_events o
              where o.event_type in (${ASSET_INSPECTION_EVENT_TYPE},
                                     ${ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE})
                and exists (select 1 from assets a
                            where a.id::text = o.aggregate_id
                              and a.kind = 'CUSTOMER_UPLOAD'
                              and not exists (select 1 from design_session_assets d
                                              where d.asset_id = a.id))`,
        ),
      ).toBe(0);
      // The `UPLOADED` row from Tx A survives by design: Tx A committed, the
      // object exists, and IDX-086 is what sweeps it. What must not survive is
      // an `INSPECTING` asset with no association.
      expect(
        await countOf(sql`select count(*)::text as count from assets a
                          where a.kind = 'CUSTOMER_UPLOAD' and a.status = 'INSPECTING'
                            and not exists (select 1 from design_session_assets d
                                            where d.asset_id = a.id)`),
      ).toBe(0);
    });
  });

  describe('the W01C hand-off', () => {
    it('persists a normalization request while the asset is still INSPECTING', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(await upload(sessionId).expect(202));

      // §5.26/§5.27 — exactly the pair W01C retries against.
      const [asset] = await assetRowOf(view.assetId);
      expect(asset?.status).toBe('INSPECTING');
      const [event] = await eventsOf(view.assetId, ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE);
      expect(event).toBeDefined();
      const [row] = await rows<{ status: string }>(
        sql`select status from outbox_events where id = ${event?.id ?? '0'}`,
      );
      expect(row?.status).toBe('PENDING');
    });

    it('keeps the same request addressable after the asset is ACCEPTED', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(await upload(sessionId).expect(202));
      await ctx.rows(sql`update assets set status = 'ACCEPTED' where id = ${view.assetId}`);

      // §5.28 — the association the payload names still resolves, unchanged, so
      // the same event converges rather than needing a new one.
      const [event] = await eventsOf(view.assetId, ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE);
      const ref = (event?.payload as { associationRef: { designSessionAssetId: string } })
        .associationRef;
      const [association] = await rows<{ session_id: string; asset_id: string }>(
        sql`select session_id, asset_id from design_session_assets where id = ${ref.designSessionAssetId}`,
      );
      expect(association).toEqual({ session_id: sessionId, asset_id: view.assetId });
      expect(await eventsOf(view.assetId, ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE)).toHaveLength(
        1,
      );
    });

    it('keeps the association context intact after the asset is REJECTED', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(await upload(sessionId).expect(202));
      await ctx.rows(sql`update assets set status = 'REJECTED' where id = ${view.assetId}`);

      // §5.29 — W01C's terminal path needs the association to still exist so it
      // can decide to stop; a cascade here would look like a missing session.
      const associations = await associationsOf(sessionId);
      expect(associations).toHaveLength(1);
      expect(associations[0]?.id).toBe(view.designSessionAssetId);
      expect(await eventsOf(view.assetId, ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE)).toHaveLength(
        1,
      );
    });
  });

  describe('privacy of the durable trace', () => {
    it('writes no raw bytes, secret, credential or public URL anywhere', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(await upload(sessionId).expect(202));
      const [asset] = await assetRowOf(view.assetId);

      // §5.30 — the whole durable trace of this upload, as text.
      const [trace] = await rows<{ blob: string }>(
        sql`select coalesce(string_agg(t.body, ' '), '') as blob from (
              select payload::text as body from outbox_events where aggregate_id = ${view.assetId}
              union all
              select coalesce(result::text, '') from idempotency_records
                where operation_namespace = ${SESSION_UPLOAD_OPERATION_NAMESPACE}
              union all
              select coalesce(summary::text, '') from audit_events
            ) as t`,
      );
      const blob = trace?.blob ?? '';

      const [session] = await rows<{ session_secret_hash: string }>(
        sql`select session_secret_hash from design_sessions where id = ${sessionId}`,
      );
      for (const forbidden of [
        session?.session_secret_hash ?? 'unreachable',
        process.env['DESIGN_SESSION_SECRET_PEPPER'] ?? 'unreachable',
        process.env['OBJECT_STORAGE_SECRET_ACCESS_KEY'] ?? 'unreachable',
        ctx.minio.endpoint,
        '\\x89PNG',
      ]) {
        expect(blob).not.toContain(forbidden);
      }
      // The response itself never carries the storage key or a URL.
      expect(JSON.stringify(view)).not.toContain(asset?.storage_key ?? 'unreachable');
      // Nothing in the durable trace claims the image is public.
      expect(
        await countOf(sql`select count(*)::text as count from assets
                          where id = ${view.assetId} and classification <> 'CUSTOMER_PRIVATE'`),
      ).toBe(0);
    });

    it('records the claim under the session-scoped namespace, completed', async () => {
      const sessionId = await ctx.seedSession();
      const view = dataOf(await upload(sessionId).expect(202));
      // The scope key is a hash, so the record is found by the assetId its
      // stored result carries rather than by a readable prefix.
      const [record] = await rows<{ operation_namespace: string; status: string }>(
        sql`select operation_namespace, status from idempotency_records
            where result ->> 'assetId' = ${view.assetId}`,
      );
      expect(record?.operation_namespace).toBe(SESSION_UPLOAD_OPERATION_NAMESPACE);
      expect(record?.status).toBe('COMPLETED');
    });
  });

  describe('cleanup', () => {
    it('runs against a disposable database that is not the development one', () => {
      // §5.31 — the harness owns teardown; this asserts it is disposable at all.
      expect(ctx.api.database.name).toMatch(/^embroidery_/);
      expect(ctx.api.database.url).toContain(ctx.api.database.name);
      expect(ctx.minio.containerName).toContain('minio');
    });
  });
});
