/**
 * `APP3-B04` over HTTP against a disposable PostgreSQL — the three LC-24
 * transitions, end to end.
 *
 * The whole stack runs, and what is asserted here and nowhere else is what
 * actually reaches the database. Two properties are only provable live:
 *
 * - **`published_at` is set once.** A republication of the same version must keep
 *   the original timestamp, and no double can prove that — it is a SQL predicate
 *   (`WHERE published_at IS NULL`), not a branch in application code.
 * - **The races.** Publish vs publish is a true conflict and must leave exactly
 *   one winner. The pairs involving archive are not, because archive accepts
 *   both `DRAFT` and `PUBLISHED`: when the other transition commits first,
 *   archive legitimately applies to the state it produced. What every
 *   interleaving must satisfy is that nothing half-applies, the end state is one
 *   LC-24 recognises, and the audit trail records exactly the transitions that
 *   succeeded.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';
import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '@embroidery/design-document';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'template-lifecycle@example.test';
const PASSWORD = 'operator-secret-123';

interface Envelope<T> {
  readonly data: T;
}

interface TemplatePayload {
  readonly templateId: string;
  readonly status: string;
  readonly currentVersion?: { version: number; publishedAt?: string };
  readonly archivedAt?: string;
}

describe('Admin Design Template lifecycle (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;
  let scope: { product: string; side: string; area: string; otherSide: string };

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app3b04-template-lifecycle');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    cookie = await login();
    scope = await seedScope();
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 240_000);

  async function login(): Promise<string> {
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });
    const raw = res.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? (raw as string[]) : [];
    const session = cookies.find((value) => value.startsWith('adm_session='));
    if (session === undefined) throw new Error('login set no adm_session cookie');
    return session.split(';')[0] as string;
  }

  const exec = async (statement: ReturnType<typeof sql>): Promise<void> => {
    await ctx.database.client.db.execute(statement);
  };

  async function rows<T>(statement: ReturnType<typeof sql>): Promise<T[]> {
    const result = await ctx.database.client.db.execute(statement);
    return (result as unknown as { rows: T[] }).rows;
  }

  async function count(statement: ReturnType<typeof sql>): Promise<number> {
    const [row] = await rows<{ count: number }>(statement);
    return Number(row?.count ?? 0);
  }

  /** A live Product with two Sides; the second exists to prove a wrong chain. */
  async function seedScope() {
    const ids = {
      asset: newId(),
      category: newId(),
      product: newId(),
      side: newId(),
      otherSide: newId(),
      area: newId(),
    };
    await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
          values (${ids.asset}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${ids.asset}.png`},
                  'image/png', 1024, 'ACCEPTED')`);
    await exec(sql`insert into categories (id, name, slug, status, display_order, is_indexable)
          values (${ids.category}, 'Fixture', ${`c-${ids.category}`}, 'PUBLISHED', 1, true)`);
    await exec(sql`insert into products
            (id, category_id, name, slug, base_price_amount, currency_code, status,
             is_display_out_of_stock, display_order, is_indexable)
          values (${ids.product}, ${ids.category}, 'Fixture Tee', ${`t-${ids.product}`}, 150000,
                  'VND', 'PUBLISHED', false, 1, true)`);
    for (const [id, code] of [
      [ids.side, 'front'],
      [ids.otherSide, 'back'],
    ] as const) {
      await exec(sql`insert into product_sides
              (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
               physical_width_mm, physical_height_mm, px_per_mm, display_order)
            values (${id}, ${ids.product}, ${code}, ${code}, ${ids.asset}, 1000, 1000, 200, 200, 5, 1)`);
    }
    await exec(sql`insert into embroidery_areas
            (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
             bound_height_px, display_order)
          values (${ids.area}, ${ids.side}, 'chest', 'Chest', 100, 100, 400, 300, 1)`);
    return {
      product: ids.product,
      side: ids.side,
      area: ids.area,
      otherSide: ids.otherSide,
    };
  }

  async function seedTemplateAsset(): Promise<{ assetId: string; derivativeId: string }> {
    const assetId = newId();
    const derivativeId = newId();
    await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
          values (${assetId}, 'TEMPLATE_SOURCE', 'PRODUCTION_SENSITIVE',
                  ${`templates/originals/${assetId}.png`}, 'image/png', 51200, 'ACCEPTED')`);
    await exec(sql`insert into asset_derivatives
            (id, asset_id, kind, status, storage_key, is_watermarked,
             width_px, height_px, media_type, byte_size)
          values (${derivativeId}, ${assetId}, 'NORMALIZED', 'READY',
                  ${`templates/derivatives/${assetId}.webp`}, false, 800, 600, 'image/webp', 40960)`);
    return { assetId, derivativeId };
  }

  function designDocument(
    elements: readonly unknown[] = [],
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
      placement: {
        productSideId: scope.side,
        embroideryAreaId: scope.area,
        canvasWidthPx: 1000,
        canvasHeightPx: 1000,
        physicalWidthMm: 200,
        physicalHeightMm: 200,
        pxPerMm: 5,
        ...overrides,
      },
      elements: [
        {
          id: 'text-1',
          type: 'text',
          visible: true,
          locked: false,
          opacity: 1,
          transform: {
            x: 120,
            y: 120,
            width: 100,
            height: 50,
            rotationDeg: 0,
            scaleX: 1,
            scaleY: 1,
          },
          text: 'Thêu',
          fontId: 'inter',
          fontSizePx: 24,
          fontWeight: 400,
          fontStyle: 'normal',
          textAlign: 'left',
          fill: '#101010',
        },
        ...elements,
      ],
    };
  }

  const post = (templateId: string, action: string, body: Record<string, unknown>) =>
    ctx.http
      .post(`/api/admin/design-templates/${templateId}/${action}`)
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send(body);

  /** A scoped DRAFT template carrying one saved version, through the real APIs. */
  async function readyTemplate(
    name: string,
    document: Record<string, unknown> = designDocument(),
    withScope = true,
  ): Promise<string> {
    const created = await ctx.http
      .post('/api/admin/design-templates')
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send({
        name,
        ...(withScope
          ? { productId: scope.product, productSideId: scope.side, embroideryAreaId: scope.area }
          : {}),
      });
    expect(created.status).toBe(201);
    const templateId = (created.body as Envelope<TemplatePayload>).data.templateId;

    const saved = await ctx.http
      .put(`/api/admin/design-templates/${templateId}/document`)
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send({ expectedCurrentVersion: 0, document });
    expect(saved.status).toBe(200);
    return templateId;
  }

  describe('publish', () => {
    it('moves a ready DRAFT to PUBLISHED and stamps published_at once', async () => {
      const templateId = await readyTemplate('Xuất bản');
      const res = await post(templateId, 'publish', { expectedCurrentVersion: 1 });

      expect(res.status).toBe(200);
      const body = res.body as Envelope<TemplatePayload>;
      expect(body.data.status).toBe('PUBLISHED');
      expect(body.data.currentVersion?.version).toBe(1);
      expect(body.data.currentVersion?.publishedAt).toBeDefined();

      const [version] = await rows<{ version: number; published_at: Date }>(
        sql`select version, published_at from design_template_versions
            where design_template_id = ${templateId}`,
      );
      expect(version?.version).toBe(1);
      expect(version?.published_at).not.toBeNull();

      // No version was created, and the counter did not move.
      const [header] = await rows<{ current_version: number }>(
        sql`select current_version from design_templates where id = ${templateId}`,
      );
      expect(header?.current_version).toBe(1);
    });

    it('publishes a template referencing an eligible Template asset', async () => {
      const { assetId, derivativeId } = await seedTemplateAsset();
      const templateId = await readyTemplate(
        'Xuất bản có ảnh',
        designDocument([
          {
            id: 'image-1',
            type: 'image',
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 120,
              y: 120,
              width: 100,
              height: 50,
              rotationDeg: 0,
              scaleX: 1,
              scaleY: 1,
            },
            assetId,
            derivativeId,
            intrinsicWidthPx: 800,
            intrinsicHeightPx: 600,
          },
        ]),
      );
      expect((await post(templateId, 'publish', { expectedCurrentVersion: 1 })).status).toBe(200);
    });

    it('refuses a header with no immutable version', async () => {
      const created = await ctx.http
        .post('/api/admin/design-templates')
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ name: 'Chưa có phiên bản' });
      const templateId = (created.body as Envelope<TemplatePayload>).data.templateId;

      const res = await post(templateId, 'publish', { expectedCurrentVersion: 0 });
      expect(res.status).toBe(422);
      const [header] = await rows<{ status: string }>(
        sql`select status from design_templates where id = ${templateId}`,
      );
      expect(header?.status).toBe('DRAFT');
    });

    it('refuses an incomplete scope, a wrong chain and out-of-bounds geometry', async () => {
      const unscoped = await readyTemplate('Thiếu phạm vi', designDocument(), false);
      expect((await post(unscoped, 'publish', { expectedCurrentVersion: 1 })).status).toBe(422);

      // A document claiming the other Side: the scope chain resolves, the
      // placement does not agree with it.
      const wrongChain = await readyTemplate(
        'Sai mặt',
        designDocument([], { productSideId: scope.otherSide }),
      );
      expect((await post(wrongChain, 'publish', { expectedCurrentVersion: 1 })).status).toBe(422);

      const outside = await readyTemplate(
        'Ngoài vùng',
        (() => {
          const document = designDocument();
          (document['elements'] as Record<string, unknown>[])[0]!['transform'] = {
            x: 900,
            y: 900,
            width: 100,
            height: 50,
            rotationDeg: 0,
            scaleX: 1,
            scaleY: 1,
          };
          return document;
        })(),
      );
      expect((await post(outside, 'publish', { expectedCurrentVersion: 1 })).status).toBe(422);

      for (const templateId of [unscoped, wrongChain, outside]) {
        const [header] = await rows<{ status: string }>(
          sql`select status from design_templates where id = ${templateId}`,
        );
        expect(header?.status).toBe('DRAFT');
      }
    });

    it('refuses a retired Side with zero mutation', async () => {
      const templateId = await readyTemplate('Mặt đã ngừng');
      await exec(sql`update product_sides set retired_at = now() where id = ${scope.side}`);
      const res = await post(templateId, 'publish', { expectedCurrentVersion: 1 });
      await exec(sql`update product_sides set retired_at = null where id = ${scope.side}`);

      expect(res.status).toBe(422);
      const [header] = await rows<{ status: string }>(
        sql`select status from design_templates where id = ${templateId}`,
      );
      expect(header?.status).toBe('DRAFT');
    });

    it('refuses a stale token and a non-DRAFT source as conflicts', async () => {
      const templateId = await readyTemplate('Xung đột xuất bản');
      expect((await post(templateId, 'publish', { expectedCurrentVersion: 0 })).status).toBe(409);
      expect((await post(templateId, 'publish', { expectedCurrentVersion: 1 })).status).toBe(200);
      expect((await post(templateId, 'publish', { expectedCurrentVersion: 1 })).status).toBe(409);
    });

    it('writes one bounded audit row and no outbox event', async () => {
      const outboxBefore = await count(sql`select count(*)::int as count from outbox_events`);
      const templateId = await readyTemplate('Kiểm toán xuất bản');
      await post(templateId, 'publish', { expectedCurrentVersion: 1 });

      const audit = await rows<{
        action: string;
        summary: Record<string, unknown>;
        reason: string | null;
      }>(
        sql`select action, summary, reason from audit_events
            where target_id = ${templateId} and action = 'design_template.published'`,
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]?.summary).toEqual({ from: 'DRAFT', to: 'PUBLISHED', version: 1 });
      // PO-03 requires a reason for archive and restore only.
      expect(audit[0]?.reason).toBeNull();
      expect(await count(sql`select count(*)::int as count from outbox_events`)).toBe(outboxBefore);
    });
  });

  describe('unpublish and republish', () => {
    it('returns to DRAFT, preserving every version and its timestamp', async () => {
      const templateId = await readyTemplate('Gỡ xuất bản');
      await post(templateId, 'publish', { expectedCurrentVersion: 1 });
      const [published] = await rows<{ published_at: Date }>(
        sql`select published_at from design_template_versions where design_template_id = ${templateId}`,
      );

      const res = await post(templateId, 'unpublish', { expectedCurrentVersion: 1 });
      expect(res.status).toBe(200);
      expect((res.body as Envelope<TemplatePayload>).data.status).toBe('DRAFT');

      const versions = await rows<{ version: number; published_at: Date }>(
        sql`select version, published_at from design_template_versions
            where design_template_id = ${templateId}`,
      );
      expect(versions).toHaveLength(1);
      expect(versions[0]?.published_at).toEqual(published?.published_at);
    });

    it('republishing the same version keeps the original published_at', async () => {
      const templateId = await readyTemplate('Xuất bản lại');
      await post(templateId, 'publish', { expectedCurrentVersion: 1 });
      const [first] = await rows<{ published_at: Date }>(
        sql`select published_at from design_template_versions where design_template_id = ${templateId}`,
      );
      await post(templateId, 'unpublish', { expectedCurrentVersion: 1 });
      await post(templateId, 'publish', { expectedCurrentVersion: 1 });

      const [again] = await rows<{ published_at: Date }>(
        sql`select published_at from design_template_versions where design_template_id = ${templateId}`,
      );
      // Set once, never rewritten — the whole point of the `IS NULL` predicate.
      expect(again?.published_at).toEqual(first?.published_at);
    });

    it('a newer version saved after unpublish becomes the published one', async () => {
      const templateId = await readyTemplate('Phiên bản mới');
      await post(templateId, 'publish', { expectedCurrentVersion: 1 });
      await post(templateId, 'unpublish', { expectedCurrentVersion: 1 });

      await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 1, document: designDocument() });

      expect((await post(templateId, 'publish', { expectedCurrentVersion: 2 })).status).toBe(200);

      const versions = await rows<{ version: number; published_at: Date | null }>(
        sql`select version, published_at from design_template_versions
            where design_template_id = ${templateId} order by version`,
      );
      expect(versions).toHaveLength(2);
      // Both stamped: version 1 when it was published, version 2 just now.
      expect(versions[0]?.published_at).not.toBeNull();
      expect(versions[1]?.published_at).not.toBeNull();
      expect(versions[0]?.published_at).not.toEqual(versions[1]?.published_at);
    });

    it('refuses unpublishing a DRAFT', async () => {
      const templateId = await readyTemplate('Chưa xuất bản');
      expect((await post(templateId, 'unpublish', { expectedCurrentVersion: 1 })).status).toBe(409);
    });
  });

  describe('archive', () => {
    for (const from of ['DRAFT', 'PUBLISHED'] as const) {
      it(`archives from ${from}, preserving versions and timestamps`, async () => {
        const templateId = await readyTemplate(`Lưu trữ từ ${from}`);
        if (from === 'PUBLISHED') {
          await post(templateId, 'publish', { expectedCurrentVersion: 1 });
        }
        const before = await rows<{ version: number; published_at: Date | null }>(
          sql`select version, published_at from design_template_versions
              where design_template_id = ${templateId}`,
        );

        const res = await post(templateId, 'archive', {
          expectedCurrentVersion: 1,
          reason: 'Hết mẫu',
        });
        expect(res.status).toBe(200);
        const body = res.body as Envelope<TemplatePayload>;
        expect(body.data.status).toBe('ARCHIVED');
        expect(body.data.archivedAt).toBeDefined();

        // Not a delete: every version and every timestamp survives.
        const after = await rows<{ version: number; published_at: Date | null }>(
          sql`select version, published_at from design_template_versions
              where design_template_id = ${templateId}`,
        );
        expect(after).toEqual(before);

        const audit = await rows<{ summary: Record<string, unknown>; reason: string }>(
          sql`select summary, reason from audit_events
              where target_id = ${templateId} and action = 'design_template.archived'`,
        );
        expect(audit).toHaveLength(1);
        expect(audit[0]?.summary).toMatchObject({ from, to: 'ARCHIVED' });
        expect(audit[0]?.reason).toBe('Hết mẫu');
      });
    }

    it('requires a non-blank reason', async () => {
      const templateId = await readyTemplate('Thiếu lý do');
      expect((await post(templateId, 'archive', { expectedCurrentVersion: 1 })).status).toBe(400);
      expect(
        (await post(templateId, 'archive', { expectedCurrentVersion: 1, reason: '   ' })).status,
      ).toBe(400);
      const [header] = await rows<{ status: string }>(
        sql`select status from design_templates where id = ${templateId}`,
      );
      expect(header?.status).toBe('DRAFT');
    });

    it('refuses archiving an already archived template', async () => {
      const templateId = await readyTemplate('Lưu trữ hai lần');
      await post(templateId, 'archive', { expectedCurrentVersion: 1, reason: 'x' });
      expect(
        (await post(templateId, 'archive', { expectedCurrentVersion: 1, reason: 'x' })).status,
      ).toBe(409);
    });

    it('cascades nothing — the Product, its sides and its assets are untouched', async () => {
      const templateId = await readyTemplate('Không lan toả');
      const before = {
        product: await count(
          sql`select count(*)::int as count from products where id = ${scope.product} and status = 'PUBLISHED'`,
        ),
        sides: await count(
          sql`select count(*)::int as count from product_sides where product_id = ${scope.product}`,
        ),
      };
      await post(templateId, 'archive', { expectedCurrentVersion: 1, reason: 'x' });

      expect(
        await count(
          sql`select count(*)::int as count from products where id = ${scope.product} and status = 'PUBLISHED'`,
        ),
      ).toBe(before.product);
      expect(
        await count(
          sql`select count(*)::int as count from product_sides where product_id = ${scope.product}`,
        ),
      ).toBe(before.sides);
    });
  });

  describe('lifecycle races', () => {
    const ITERATIONS = 5;

    /**
     * Two racing transitions are not always a conflict.
     *
     * `publish` requires `DRAFT` and `unpublish` requires `PUBLISHED`, so a
     * second one of the *same* transition always loses. But `archive` accepts
     * `DRAFT` **or** `PUBLISHED` by design (`TR-LC24-04`/`TR-LC24-05`), so when
     * the other transition commits first, archive legitimately applies to the
     * state it produced: `PUBLISHED → DRAFT → ARCHIVED` is two valid transitions
     * in sequence, not a lost race.
     *
     * Asserting "exactly one 409" for those pairs would therefore be asserting a
     * timing accident. What must hold in every interleaving is this: no request
     * half-applies, the end state is one LC-24 recognises, every success left
     * exactly one audit row, and the publication timestamp survives.
     */
    const lifecycleAudits = (templateId: string) =>
      count(
        sql`select count(*)::int as count from audit_events
            where target_id = ${templateId}
              and action in ('design_template.published', 'design_template.unpublished',
                             'design_template.archived')`,
      );

    const assertConsistent = async (
      templateId: string,
      responses: readonly { status: number }[],
      allowedFinal: readonly string[],
      auditsBefore: number,
    ) => {
      const succeeded = responses.filter((response) => response.status === 200).length;
      // At least one must succeed: both failing would mean neither predicate
      // matched a state that certainly existed.
      expect(succeeded).toBeGreaterThanOrEqual(1);
      for (const response of responses) {
        expect([200, 409]).toContain(response.status);
      }

      const [header] = await rows<{ status: string }>(
        sql`select status from design_templates where id = ${templateId}`,
      );
      expect(allowedFinal).toContain(header?.status);

      // A **delta**, not an absolute: one of these races publishes during setup,
      // and counting every lifecycle row would charge that transition to the
      // race. One row per success, none for a refusal — the transition and its
      // evidence commit together or not at all.
      expect((await lifecycleAudits(templateId)) - auditsBefore).toBe(succeeded);
    };

    it('publish vs publish leaves one winner', async () => {
      for (let index = 0; index < ITERATIONS; index += 1) {
        const templateId = await readyTemplate(`Đua xuất bản ${String(index)}`);
        const [a, b] = await Promise.all([
          post(templateId, 'publish', { expectedCurrentVersion: 1 }),
          post(templateId, 'publish', { expectedCurrentVersion: 1 }),
        ]);
        expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);

        const [header] = await rows<{ status: string }>(
          sql`select status from design_templates where id = ${templateId}`,
        );
        expect(header?.status).toBe('PUBLISHED');
        expect(
          await count(sql`select count(*)::int as count from audit_events
                          where target_id = ${templateId}
                            and action = 'design_template.published'`),
        ).toBe(1);
      }
    }, 180_000);

    it('publish vs archive from DRAFT ends in a valid state with matching evidence', async () => {
      for (let index = 0; index < ITERATIONS; index += 1) {
        const templateId = await readyTemplate(`Đua lưu trữ ${String(index)}`);
        const before = await lifecycleAudits(templateId);
        const responses = await Promise.all([
          post(templateId, 'publish', { expectedCurrentVersion: 1 }),
          post(templateId, 'archive', { expectedCurrentVersion: 1, reason: 'đua' }),
        ]);
        // Archive first leaves ARCHIVED and refuses the publish; publish first
        // leaves PUBLISHED, which archive may then legitimately archive.
        await assertConsistent(templateId, responses, ['PUBLISHED', 'ARCHIVED'], before);
      }
    }, 180_000);

    it('unpublish vs archive from PUBLISHED ends in a valid state with matching evidence', async () => {
      for (let index = 0; index < ITERATIONS; index += 1) {
        const templateId = await readyTemplate(`Đua gỡ ${String(index)}`);
        await post(templateId, 'publish', { expectedCurrentVersion: 1 });
        const before = await lifecycleAudits(templateId);
        const responses = await Promise.all([
          post(templateId, 'unpublish', { expectedCurrentVersion: 1 }),
          post(templateId, 'archive', { expectedCurrentVersion: 1, reason: 'đua' }),
        ]);
        await assertConsistent(templateId, responses, ['DRAFT', 'ARCHIVED'], before);

        // The publication timestamp survives every interleaving: neither
        // transition may clear what publish stamped.
        const [version] = await rows<{ published_at: Date | null }>(
          sql`select published_at from design_template_versions
              where design_template_id = ${templateId}`,
        );
        expect(version?.published_at).not.toBeNull();
      }
    }, 180_000);
  });

  describe('authorization', () => {
    it('refuses every transition without an Admin session or from a foreign origin', async () => {
      const templateId = await readyTemplate('Bảo vệ vòng đời');
      for (const action of ['publish', 'unpublish', 'archive']) {
        const anonymous = await ctx.http
          .post(`/api/admin/design-templates/${templateId}/${action}`)
          .set('Origin', ADMIN_ORIGIN)
          .send({ expectedCurrentVersion: 1, reason: 'x' });
        expect(anonymous.status).toBe(401);

        const foreign = await ctx.http
          .post(`/api/admin/design-templates/${templateId}/${action}`)
          .set('Cookie', cookie)
          .set('Origin', 'http://evil.example')
          .send({ expectedCurrentVersion: 1, reason: 'x' });
        expect(foreign.status).toBe(403);
      }
    });

    it('answers 404 for an unknown template', async () => {
      expect((await post(newId(), 'publish', { expectedCurrentVersion: 1 })).status).toBe(404);
    });
  });
});
