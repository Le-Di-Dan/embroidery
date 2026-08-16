/**
 * `APP5-B04` — the Admin request detail, over real HTTP against PostgreSQL
 * (§15.3).
 *
 * The read has to be operationally complete *and* bounded, so the suite proves
 * both directions: the evidence an operator decides from is present and
 * correctly ordered, and nothing a credential or an object store owns appears
 * anywhere in the response.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createAdminRequestContext,
  dataOf,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  FIXTURE_PHONE,
  FIXTURE_PHONE_MASK,
  ROUTES,
  SECRET_MARKER,
  type AdminRequestTestContext,
  type SeededCatalogSubject,
} from './admin-request-context';

interface DetailBody {
  readonly requestId: string;
  readonly code: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly customerNote?: string;
  readonly internalReason?: string;
  readonly customerVisibleReason?: string;
  readonly customer?: {
    readonly customerId: string;
    readonly displayName?: string;
    readonly verifiedAt: string;
    readonly contacts: readonly {
      readonly kind: string;
      readonly maskedValue: string;
      readonly verified: boolean;
      readonly primary: boolean;
    }[];
  };
  readonly subject?: Record<string, unknown>;
  readonly quantities: readonly {
    readonly productVariantId?: string;
    readonly sizeLabel?: string;
    readonly quantity: number;
  }[];
  readonly totalQuantity: number;
  readonly assets: readonly {
    readonly assetId: string;
    readonly role: string;
    readonly linkedAt: string;
    readonly mimeType?: string;
    readonly sizeBytes?: string;
    readonly status?: string;
  }[];
  readonly transitions: readonly {
    readonly sequence: number;
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly actorKind: string;
    readonly actorAdminId?: string;
    readonly internalReason?: string;
    readonly customerVisibleReason?: string;
    readonly occurredAt: string;
  }[];
  readonly moderationNotes: readonly {
    readonly sequence: number;
    readonly kind: string;
    readonly note: string;
    readonly adminId: string;
    readonly createdAt: string;
  }[];
}

describe('APP5-B04 — Admin custom request detail', () => {
  let context: AdminRequestTestContext;
  let cookie: string;
  let customerId: string;
  let catalog: SeededCatalogSubject;

  beforeAll(async () => {
    context = await createAdminRequestContext('app5-b04-detail');
  }, 180_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    cookie = (await context.seedAdminSession()).cookie;
    customerId = await context.seedCustomer();
    catalog = await context.seedCatalogSubject();
  });

  async function readDetail(requestId: string): Promise<DetailBody> {
    const response = await request(context.server())
      .get(ROUTES.detail(requestId))
      .set('Cookie', cookie)
      .expect(200);
    return dataOf<DetailBody>(response);
  }

  describe('authorization and addressing', () => {
    it('refuses a caller with no Admin session', async () => {
      const seeded = await context.seedRequest({ customerId });
      await request(context.server()).get(ROUTES.detail(seeded.requestId)).expect(401);
    });

    it('answers 404 for an unknown request', async () => {
      await request(context.server())
        .get(ROUTES.detail('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff'))
        .set('Cookie', cookie)
        .expect(404);
    });

    it('answers 400 for a malformed request id', async () => {
      await request(context.server())
        .get(ROUTES.detail('not-a-uuid'))
        .set('Cookie', cookie)
        .expect(400);
    });
  });

  describe('catalog branch', () => {
    it('returns the product, variant, quantities and design provenance', async () => {
      const designSessionId = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a';
      const seeded = await context.seedRequest({
        customerId,
        status: 'UNDER_REVIEW',
        catalog: { productId: catalog.productId, productVariantId: catalog.productVariantId },
        designSessionId,
        customerNote: 'Mình muốn thêu tên ở ngực trái.',
        quantities: [
          { productVariantId: catalog.productVariantId, sizeLabel: 'L', quantity: 12 },
          { productVariantId: catalog.productVariantId, sizeLabel: 'M', quantity: 8 },
        ],
      });

      const detail = await readDetail(seeded.requestId);

      expect(detail).toMatchObject({
        requestId: seeded.requestId,
        code: seeded.code,
        status: 'UNDER_REVIEW',
        customerNote: 'Mình muốn thêu tên ở ngực trái.',
      });
      expect(detail.subject).toEqual({
        kind: 'CATALOG',
        productId: catalog.productId,
        productVariantId: catalog.productVariantId,
        productName: catalog.productName,
        productSlug: catalog.productSlug,
        variantColorName: 'Trắng',
        variantSizeLabel: 'L',
        designSessionId,
      });
      expect(detail.quantities).toHaveLength(2);
      expect(detail.totalQuantity).toBe(20);
    });

    it('returns the customer with masked contacts and no raw value', async () => {
      const seeded = await context.seedRequest({ customerId });

      const detail = await readDetail(seeded.requestId);

      expect(detail.customer?.customerId).toBe(customerId);
      expect(detail.customer?.displayName).toBe('Nguyễn Bảy');
      expect(detail.customer?.contacts).toEqual([
        { kind: 'EMAIL', maskedValue: FIXTURE_EMAIL_MASK, verified: true, primary: true },
        { kind: 'PHONE', maskedValue: FIXTURE_PHONE_MASK, verified: true, primary: false },
      ]);
    });
  });

  describe('customer-owned branch', () => {
    it('returns the item, its dimensions and its quantity lines', async () => {
      const seeded = await context.seedRequest({
        customerId,
        customerOwnedProduct: {
          name: 'Áo khoác jean cá nhân',
          description: 'Áo khoác cũ, thêu ở lưng.',
          physicalWidthMm: '250.00',
          physicalHeightMm: '300.00',
        },
        quantities: [{ sizeLabel: 'M', quantity: 3 }],
      });

      const detail = await readDetail(seeded.requestId);

      expect(detail.subject).toEqual({
        kind: 'CUSTOMER_OWNED',
        name: 'Áo khoác jean cá nhân',
        description: 'Áo khoác cũ, thêu ở lưng.',
        physicalWidthMm: '250.00',
        physicalHeightMm: '300.00',
      });
      // A COP line has no catalog variant, and the response says so by omitting
      // the field rather than inventing one.
      expect(detail.quantities).toEqual([{ sizeLabel: 'M', quantity: 3 }]);
      expect(detail.totalQuantity).toBe(3);
    });

    it('returns attachment metadata without any storage locator', async () => {
      const seeded = await context.seedRequest({
        customerId,
        customerOwnedProduct: { name: 'Áo khoác jean cá nhân' },
        assets: [{ role: 'COP_IMAGE' }, { role: 'REFERENCE' }],
      });

      const detail = await readDetail(seeded.requestId);

      expect(detail.assets).toHaveLength(2);
      expect(detail.assets.map((asset) => asset.role)).toEqual(['COP_IMAGE', 'REFERENCE']);
      for (const asset of detail.assets) {
        expect(seeded.assetIds).toContain(asset.assetId);
        expect(asset.mimeType).toBe('image/png');
        // A `bigint` byte count crosses as a decimal string, never as a float.
        expect(asset.sizeBytes).toBe('2048');
        expect(asset.status).toBe('ACCEPTED');
        expect(Object.keys(asset)).not.toContain('storageKey');
        expect(Object.keys(asset)).not.toContain('checksum');
        expect(Object.keys(asset)).not.toContain('url');
      }
    });
  });

  describe('transition history', () => {
    it('returns every recorded move, oldest first, with both reasons kept apart', async () => {
      const seeded = await context.seedRequest({ customerId });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'UNDER_REVIEW',
        to: 'NEEDS_CLARIFICATION',
        reason: 'Ảnh mờ, không đủ chi tiết.',
        customerVisibleReason: 'Xưởng cần thêm ảnh rõ hơn.',
      });

      const detail = await readDetail(seeded.requestId);

      expect(detail.status).toBe('NEEDS_CLARIFICATION');
      expect(detail.transitions.map((entry) => [entry.fromStatus, entry.toStatus])).toEqual([
        ['NEW', 'UNDER_REVIEW'],
        ['UNDER_REVIEW', 'NEEDS_CLARIFICATION'],
      ]);
      expect(detail.transitions[0]?.sequence).toBeLessThan(
        detail.transitions[1]?.sequence ?? Number.MAX_SAFE_INTEGER,
      );
      expect(detail.transitions[1]).toMatchObject({
        actorKind: 'ADMIN',
        actorAdminId: context.adminId(),
        internalReason: 'Ảnh mờ, không đủ chi tiết.',
        customerVisibleReason: 'Xưởng cần thêm ảnh rõ hơn.',
      });

      // The root's two reason fields mirror the latest move into the current
      // status, and remain two different fields.
      expect(detail.internalReason).toBe('Ảnh mờ, không đủ chi tiết.');
      expect(detail.customerVisibleReason).toBe('Xưởng cần thêm ảnh rõ hơn.');
      expect(detail.internalReason).not.toBe(detail.customerVisibleReason);
    });

    it('reports an internal reason recorded with no customer-facing text', async () => {
      const seeded = await context.seedRequest({ customerId });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'REJECTED',
        reason: 'Spam — nội dung quảng cáo.',
      });

      const detail = await readDetail(seeded.requestId);

      expect(detail.internalReason).toBe('Spam — nội dung quảng cáo.');
      // Never filled from the internal half: that collapse is exactly what §10
      // forbids, and it would publish staff wording to a customer.
      expect(detail.customerVisibleReason).toBeUndefined();
    });

    it('adds no synthetic creation entry for an unmoderated request', async () => {
      const seeded = await context.seedRequest({ customerId, status: 'NEW' });

      const detail = await readDetail(seeded.requestId);

      // TR-LC11-01 writes no transition row (`G01-D05`), so the history is
      // genuinely empty and `submittedAt` is the request's own instant.
      expect(detail.transitions).toEqual([]);
      expect(detail.internalReason).toBeUndefined();
      expect(detail.customerVisibleReason).toBeUndefined();
      expect(detail.submittedAt).toEqual(expect.any(String));
    });

    it('prefers the request row’s own columns on a cancellation', async () => {
      const seeded = await context.seedRequest({
        customerId,
        cancelledReason: 'Khách yêu cầu huỷ qua điện thoại.',
        cancelledCustomerReason: 'Yêu cầu đã được huỷ theo đề nghị của bạn.',
      });
      await context.recordTransition({ requestId: seeded.requestId, from: 'NEW', to: 'CANCELLED' });

      const detail = await readDetail(seeded.requestId);

      expect(detail.internalReason).toBe('Khách yêu cầu huỷ qua điện thoại.');
      expect(detail.customerVisibleReason).toBe('Yêu cầu đã được huỷ theo đề nghị của bạn.');
    });
  });

  describe('moderation notes', () => {
    it('returns them oldest first and read-only', async () => {
      const seeded = await context.seedRequest({ customerId });
      await context.recordModerationNote({
        requestId: seeded.requestId,
        kind: 'NOTE',
        note: 'Khách đã gửi thêm ảnh qua Zalo.',
      });
      await context.recordModerationNote({
        requestId: seeded.requestId,
        kind: 'CLARIFY',
        note: 'Đã hỏi lại kích thước.',
      });

      const detail = await readDetail(seeded.requestId);

      expect(detail.moderationNotes.map((note) => note.note)).toEqual([
        'Khách đã gửi thêm ảnh qua Zalo.',
        'Đã hỏi lại kích thước.',
      ]);
      expect(detail.moderationNotes[0]?.kind).toBe('NOTE');
      expect(detail.moderationNotes[1]?.adminId).toBe(context.adminId());
    });
  });

  describe('the read changes nothing', () => {
    it('writes no transition, no note and no status change', async () => {
      const seeded = await context.seedRequest({ customerId, status: 'NEW' });
      const db = context.disposable.client.db;

      const before = await db.execute(sql`
        select status, updated_at from custom_requests where id = ${seeded.requestId}
      `);
      await readDetail(seeded.requestId);
      await readDetail(seeded.requestId);
      const after = await db.execute(sql`
        select status, updated_at from custom_requests where id = ${seeded.requestId}
      `);

      expect(after.rows[0]).toEqual(before.rows[0]);

      const { rows: transitions } = await db.execute<{ readonly count: string }>(sql`
        select count(*)::text as count from custom_request_transitions
        where custom_request_id = ${seeded.requestId}
      `);
      const { rows: notes } = await db.execute<{ readonly count: string }>(sql`
        select count(*)::text as count from request_moderation_notes
        where custom_request_id = ${seeded.requestId}
      `);
      expect(transitions[0]?.count).toBe('0');
      expect(notes[0]?.count).toBe('0');
    });
  });

  describe('privacy', () => {
    it('publishes no grant digest, storage key, correlation id or raw contact', async () => {
      const seeded = await context.seedRequest({
        customerId,
        catalog: { productId: catalog.productId, productVariantId: catalog.productVariantId },
        designSessionId: '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a',
        assets: [{ role: 'REFERENCE' }],
      });
      await context.seedGrant({ customerId, requestId: seeded.requestId });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });

      const response = await request(context.server())
        .get(ROUTES.detail(seeded.requestId))
        .set('Cookie', cookie)
        .expect(200);
      const body = JSON.stringify(response.body);

      // One marker covers the grant digest, the storage key and the transition's
      // correlation id: all three fixtures embed it, so a single absent string
      // proves none of the three columns crossed.
      expect(body).not.toContain(SECRET_MARKER);
      expect(body).not.toContain(FIXTURE_EMAIL);
      expect(body).not.toContain(FIXTURE_PHONE);
      expect(body).not.toContain('tokenHash');
      expect(body).not.toContain('storageKey');
      expect(body).not.toContain('correlationId');
      // No action metadata: `APP5-B05` owns lifecycle enforcement (§11).
      expect(body).not.toContain('availableActions');
    });

    it('does not cache the detail in a shared proxy', async () => {
      const seeded = await context.seedRequest({ customerId });
      const response = await request(context.server())
        .get(ROUTES.detail(seeded.requestId))
        .set('Cookie', cookie)
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
