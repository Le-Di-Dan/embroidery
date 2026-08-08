/**
 * `APP3-B03` over HTTP against a disposable PostgreSQL — the three Admin Design
 * Template operations end to end.
 *
 * The whole stack runs: the Admin guard, the Zod validation pipe, the response
 * envelope, the exception filter and real SQL. What is asserted here and nowhere
 * else is what actually reaches the database, and above all what does **not**:
 * the checkpoint's whole claim is that creating a header writes a header and
 * nothing more, and a doubled repository can only prove that a method was not
 * called, not that a row was not written.
 *
 * So every "no version / no association / no event" assertion below counts rows
 * in the real tables. Three of them would have passed against doubles while a
 * stray insert sat in the transaction.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'templates@example.test';
const PASSWORD = 'operator-secret-123';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly data: T;
  readonly meta: { readonly requestId: string };
}

interface TemplatePayload {
  readonly templateId: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scope?: { productId: string; productSideId: string; embroideryAreaId: string };
  readonly currentVersion?: { version: number };
  readonly document?: unknown;
  readonly description?: string;
}

interface ListPayload {
  readonly items: TemplatePayload[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

describe('Admin Design Template HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;
  let placement: { product: string; side: string; area: string; otherSide: string };

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app3b03-template-http');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    cookie = await login();
    placement = await seedPlacement();
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
    if (session === undefined) {
      throw new Error('login set no adm_session cookie');
    }
    return session.split(';')[0] as string;
  }

  const exec = async (statement: ReturnType<typeof sql>): Promise<void> => {
    await ctx.database.client.db.execute(statement);
  };

  /** One Product with two live Sides; the second exists to prove cross-Side refusal. */
  async function seedPlacement() {
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
            values (${id}, ${ids.product}, ${code}, ${code}, ${ids.asset}, 1000, 1200, 400, 480, 2.5, 1)`);
    }
    await exec(sql`insert into embroidery_areas
            (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
             bound_height_px, display_order)
          values (${ids.area}, ${ids.side}, 'chest', 'Chest', 100, 150, 300, 200, 1)`);
    return {
      product: ids.product,
      side: ids.side,
      area: ids.area,
      otherSide: ids.otherSide,
    };
  }

  const create = (body: Record<string, unknown>) =>
    ctx.http
      .post('/api/admin/design-templates')
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send(body);

  async function countRows(statement: ReturnType<typeof sql>): Promise<number> {
    const result = await ctx.database.client.db.execute(statement);
    const rows = result as unknown as { rows?: { count: string | number }[] };
    return Number(rows.rows?.[0]?.count ?? 0);
  }

  describe('create', () => {
    it('writes exactly one DRAFT header and nothing else', async () => {
      const versionsBefore = await countRows(
        sql`select count(*)::int as count from design_template_versions`,
      );
      const associationsBefore = await countRows(
        sql`select count(*)::int as count from design_template_assets`,
      );
      const outboxBefore = await countRows(sql`select count(*)::int as count from outbox_events`);

      const res = await create({ name: 'Hoa sen cổ điển' });
      expect(res.status).toBe(201);
      const body = res.body as Envelope<TemplatePayload>;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('DRAFT');
      expect(body.data.slug).toBe('hoa-sen-co-dien');
      expect(body.data.currentVersion).toBeUndefined();
      expect(body.data.document).toBeUndefined();

      const stored = (await ctx.database.client.db.execute(sql`
        select status, current_version, product_id from design_templates
        where id = ${body.data.templateId}
      `)) as unknown as {
        rows: { status: string; current_version: number; product_id: string | null }[];
      };
      expect(stored.rows[0]?.status).toBe('DRAFT');
      // Zero, not one. The counter is the header's, and no version exists to
      // point at — `APP3-B03A` writes the first one.
      expect(stored.rows[0]?.current_version).toBe(0);
      expect(stored.rows[0]?.product_id).toBeNull();

      // Deltas, not absolutes: other cases in this suite share the database.
      expect(
        await countRows(sql`select count(*)::int as count from design_template_versions`),
      ).toBe(versionsBefore);
      expect(await countRows(sql`select count(*)::int as count from design_template_assets`)).toBe(
        associationsBefore,
      );
      expect(await countRows(sql`select count(*)::int as count from outbox_events`)).toBe(
        outboxBefore,
      );
    });

    it('writes one bounded audit row carrying no document', async () => {
      const res = await create({ name: 'Có kiểm toán' });
      const templateId = (res.body as Envelope<TemplatePayload>).data.templateId;

      const audit = (await ctx.database.client.db.execute(sql`
        select action, target_kind, summary, correlation_id, actor_kind, admin_id
        from audit_events where target_id = ${templateId}
      `)) as unknown as {
        rows: {
          action: string;
          target_kind: string;
          summary: Record<string, unknown>;
          correlation_id: string;
          actor_kind: string;
          admin_id: string | null;
        }[];
      };

      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]?.action).toBe('design_template.created');
      expect(audit.rows[0]?.target_kind).toBe('DESIGN_TEMPLATE');
      expect(audit.rows[0]?.summary).toEqual({ to: 'DRAFT', slug: 'co-kiem-toan' });
      expect(audit.rows[0]?.correlation_id).toBeTruthy();
      // Attribution is the point of the row: a fabricated or absent actor would
      // make it evidence of nothing. `CST-072` also requires `admin_id` to be
      // the populated reference for an `ADMIN` actor_kind.
      expect(audit.rows[0]?.actor_kind).toBe('ADMIN');
      expect(audit.rows[0]?.admin_id).toBeTruthy();
    });

    it('persists a complete scope triple', async () => {
      const res = await create({
        name: 'Có phạm vi',
        productId: placement.product,
        productSideId: placement.side,
        embroideryAreaId: placement.area,
      });
      expect(res.status).toBe(201);
      const body = res.body as Envelope<TemplatePayload>;
      expect(body.data.scope).toEqual({
        productId: placement.product,
        productSideId: placement.side,
        embroideryAreaId: placement.area,
      });

      const stored = (await ctx.database.client.db.execute(sql`
        select product_id, product_side_id, embroidery_area_id from design_templates
        where id = ${body.data.templateId}
      `)) as unknown as {
        rows: { product_id: string; product_side_id: string; embroidery_area_id: string }[];
      };
      expect(stored.rows[0]).toEqual({
        product_id: placement.product,
        product_side_id: placement.side,
        embroidery_area_id: placement.area,
      });
    });

    it('refuses an Area that hangs from another Side, writing nothing', async () => {
      const before = await countRows(sql`select count(*)::int as count from design_templates`);
      const res = await create({
        name: 'Sai phạm vi',
        productId: placement.product,
        // The Area belongs to `side`, not `otherSide`.
        productSideId: placement.otherSide,
        embroideryAreaId: placement.area,
      });
      expect(res.status).toBe(400);
      expect(await countRows(sql`select count(*)::int as count from design_templates`)).toBe(
        before,
      );
    });

    it('refuses a partial scope before it reaches the database', async () => {
      const res = await create({ name: 'Thiếu phạm vi', productId: placement.product });
      expect(res.status).toBe(400);
    });

    it('refuses an unknown field and a caller-chosen slug', async () => {
      expect((await create({ name: 'X', slug: 'chon-truoc' })).status).toBe(400);
      expect((await create({ name: 'X', designDocument: {} })).status).toBe(400);
    });

    it('gives a colliding name a distinct address', async () => {
      const first = await create({ name: 'Trùng tên' });
      const second = await create({ name: 'Trùng tên' });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const a = (first.body as Envelope<TemplatePayload>).data.slug;
      const b = (second.body as Envelope<TemplatePayload>).data.slug;
      expect(a).toBe('trung-ten');
      expect(b).not.toBe(a);
      expect(b).toMatch(/^trung-ten-[0-9a-f]{8}$/);
    });
  });

  describe('detail', () => {
    it('represents a zero-version template truthfully', async () => {
      const created = await create({ name: 'Chưa có phiên bản' });
      const templateId = (created.body as Envelope<TemplatePayload>).data.templateId;

      const res = await ctx.http
        .get(`/api/admin/design-templates/${templateId}`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      const body = res.body as Envelope<TemplatePayload>;
      expect(body.data.templateId).toBe(templateId);
      expect(body.data.currentVersion).toBeUndefined();
      expect(body.data.document).toBeUndefined();
    });

    it('returns the highest version and its document once one exists', async () => {
      // Written with SQL because `APP3-B03` has no save; this is exactly the row
      // `APP3-B03A` will write, and the read must already be correct for it.
      const created = await create({ name: 'Có phiên bản' });
      const templateId = (created.body as Envelope<TemplatePayload>).data.templateId;
      await exec(sql`insert into design_template_versions
              (id, design_template_id, version, design_document, document_schema_version)
            values (${newId()}, ${templateId}, 1, ${'{"schemaVersion":1}'}::jsonb, 1)`);
      await exec(sql`insert into design_template_versions
              (id, design_template_id, version, design_document, document_schema_version)
            values (${newId()}, ${templateId}, 2, ${'{"schemaVersion":1,"latest":true}'}::jsonb, 1)`);

      const res = await ctx.http
        .get(`/api/admin/design-templates/${templateId}`)
        .set('Cookie', cookie);
      const body = res.body as Envelope<TemplatePayload>;
      expect(body.data.currentVersion?.version).toBe(2);
      expect(body.data.document).toEqual({ schemaVersion: 1, latest: true });
    });

    it('answers 404 for an unknown template and 400 for a non-uuid', async () => {
      expect(
        (await ctx.http.get(`/api/admin/design-templates/${newId()}`).set('Cookie', cookie)).status,
      ).toBe(404);
      expect(
        (await ctx.http.get('/api/admin/design-templates/not-a-uuid').set('Cookie', cookie)).status,
      ).toBe(400);
    });

    it('reads a non-DRAFT template', async () => {
      const created = await create({ name: 'Đã xuất bản' });
      const templateId = (created.body as Envelope<TemplatePayload>).data.templateId;
      await exec(sql`update design_templates set status = 'ARCHIVED' where id = ${templateId}`);
      const res = await ctx.http
        .get(`/api/admin/design-templates/${templateId}`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect((res.body as Envelope<TemplatePayload>).data.status).toBe('ARCHIVED');
    });
  });

  describe('list', () => {
    it('pages by a stable keyset without repeating or dropping a row', async () => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const query: Record<string, string> = { limit: '2' };
        if (cursor !== undefined) query['cursor'] = cursor;
        const res = await ctx.http
          .get('/api/admin/design-templates')
          .query(query)
          .set('Cookie', cookie);
        expect(res.status).toBe(200);
        const body = res.body as Envelope<ListPayload>;
        seen.push(...body.data.items.map((item) => item.templateId));
        if (!body.data.hasNext) break;
        cursor = body.data.nextCursor;
        expect(cursor).toBeDefined();
      }
      expect(new Set(seen).size).toBe(seen.length);

      const total = await countRows(sql`select count(*)::int as count from design_templates`);
      expect(seen).toHaveLength(total);
    });

    it('orders newest first', async () => {
      const res = await ctx.http
        .get('/api/admin/design-templates')
        .query({ limit: '100' })
        .set('Cookie', cookie);
      const items = (res.body as Envelope<ListPayload>).data.items;
      const timestamps = items.map((item) => Date.parse(item.createdAt));
      expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    });

    it('filters by status and by product without hiding anything by default', async () => {
      const archived = await ctx.http
        .get('/api/admin/design-templates')
        .query({ status: 'ARCHIVED', limit: '100' })
        .set('Cookie', cookie);
      const archivedItems = (archived.body as Envelope<ListPayload>).data.items;
      expect(archivedItems.length).toBeGreaterThan(0);
      expect(archivedItems.every((item) => item.status === 'ARCHIVED')).toBe(true);

      const scoped = await ctx.http
        .get('/api/admin/design-templates')
        .query({ productId: placement.product, limit: '100' })
        .set('Cookie', cookie);
      const scopedItems = (scoped.body as Envelope<ListPayload>).data.items;
      expect(scopedItems.length).toBeGreaterThan(0);
      expect(scopedItems.every((item) => item.scope?.productId === placement.product)).toBe(true);

      // The unfiltered page is the Admin's whole catalog, archived rows included.
      const all = await ctx.http
        .get('/api/admin/design-templates')
        .query({ limit: '100' })
        .set('Cookie', cookie);
      const statuses = new Set(
        (all.body as Envelope<ListPayload>).data.items.map((item) => item.status),
      );
      expect(statuses.has('ARCHIVED')).toBe(true);
      expect(statuses.has('DRAFT')).toBe(true);
    });

    it('carries no version summary or document on the page', async () => {
      const res = await ctx.http
        .get('/api/admin/design-templates')
        .query({ limit: '100' })
        .set('Cookie', cookie);
      const items = (res.body as Envelope<ListPayload>).data.items;
      expect(items.every((item) => item.currentVersion === undefined)).toBe(true);
      expect(items.every((item) => item.document === undefined)).toBe(true);
    });

    it('refuses a malformed cursor and an out-of-range limit', async () => {
      expect(
        (
          await ctx.http
            .get('/api/admin/design-templates')
            .query({ cursor: 'not-a-cursor' })
            .set('Cookie', cookie)
        ).status,
      ).toBe(400);
      expect(
        (
          await ctx.http
            .get('/api/admin/design-templates')
            .query({ limit: '101' })
            .set('Cookie', cookie)
        ).status,
      ).toBe(400);
    });
  });

  describe('authorization and privacy', () => {
    it('refuses every operation without an Admin session', async () => {
      expect((await ctx.http.get('/api/admin/design-templates')).status).toBe(401);
      expect((await ctx.http.get(`/api/admin/design-templates/${newId()}`)).status).toBe(401);
      const created = await ctx.http
        .post('/api/admin/design-templates')
        .set('Origin', ADMIN_ORIGIN)
        .send({ name: 'Không có phiên' });
      expect(created.status).toBe(401);
    });

    it('refuses a create from an origin outside the Admin allowlist', async () => {
      const res = await ctx.http
        .post('/api/admin/design-templates')
        .set('Cookie', cookie)
        .set('Origin', 'http://evil.example')
        .send({ name: 'Sai nguồn' });
      expect(res.status).toBe(403);
    });

    it('leaks no storage identity in any response', async () => {
      const created = await create({ name: 'Không rò rỉ' });
      const templateId = (created.body as Envelope<TemplatePayload>).data.templateId;
      const detail = await ctx.http
        .get(`/api/admin/design-templates/${templateId}`)
        .set('Cookie', cookie);
      const list = await ctx.http
        .get('/api/admin/design-templates')
        .query({ limit: '100' })
        .set('Cookie', cookie);

      for (const payload of [created.body, detail.body, list.body]) {
        const text = JSON.stringify(payload);
        for (const leak of [
          'storageKey',
          'storage_key',
          'bucket',
          'previewDerivativeId',
          'development/originals',
        ]) {
          expect(text).not.toContain(leak);
        }
      }
    });
  });
});
