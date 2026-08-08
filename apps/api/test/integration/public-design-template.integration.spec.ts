/**
 * `APP3-B05` over HTTP against a disposable PostgreSQL — the two public reads,
 * end to end.
 *
 * The whole stack runs, and what is asserted here and nowhere else is what
 * actually reaches the database. Four properties are only provable live:
 *
 * - **Visibility follows the lifecycle.** Publish, unpublish, republish and
 *   archive each change what an anonymous caller sees, and each of those is a
 *   SQL predicate rather than a branch a double could stand in for.
 * - **The published version is chosen by `published_at`, not by
 *   `current_version`.** The two agree in every state the delivered lifecycle
 *   can reach, so the only way to prove the read does not depend on that
 *   agreement is to write a row that breaks it — which needs a real table.
 * - **Derived ineligibility.** Unpublishing the *Product* hides its Templates
 *   while leaving every Template row byte-for-byte unchanged. Both halves are
 *   database facts.
 * - **Zero writes.** Proved by comparing full-table digests across a run of
 *   every public read, not by trusting that no write was coded.
 *
 * Templates are created, saved and transitioned through the real `APP3-B03`,
 * `APP3-B03A` and `APP3-B04` HTTP surfaces rather than by hand-written SQL, so
 * this suite consumes the delivered lifecycle instead of restating its
 * semantics in fixtures.
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
const EMAIL = 'public-template-read@example.test';
const PASSWORD = 'operator-secret-123';

const LIST = '/api/public/design-templates';

interface Envelope<T> {
  readonly data: T;
}

interface SummaryPayload {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly scope: { productId: string; productSideId: string; embroideryAreaId: string };
  readonly publishedVersion: {
    version: number;
    documentSchemaVersion: number;
    publishedAt: string;
  };
}

interface DetailPayload extends SummaryPayload {
  readonly document: Record<string, unknown>;
}

interface ListPayload {
  readonly items: readonly SummaryPayload[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

interface AdminTemplatePayload {
  readonly templateId: string;
  readonly status: string;
}

describe('public Design Template reads (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;
  let scope: {
    product: string;
    category: string;
    side: string;
    area: string;
    otherArea: string;
    otherSide: string;
  };

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app3b05-public-template');
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

  /**
   * The server-owned slug of a Template, read back after the Admin create.
   *
   * Resolving it is itself an assertion: a create that silently wrote nothing
   * would otherwise leave every visibility case below asserting against an
   * empty slug, which the public read answers with a 404 — the same answer the
   * case expects for a hidden template.
   */
  async function slugOf(statement: ReturnType<typeof sql>): Promise<string> {
    const [row] = await rows<{ slug: string }>(statement);
    if (row === undefined) throw new Error('the template was not created');
    return row.slug;
  }

  /**
   * A published Product in a public category, with two Sides and two Areas.
   *
   * The second Side and the second Area exist so a "wrong chain" is a real row
   * rather than a random id — an Area of another Side of the *same* Product is
   * the case an equality-only check would wave through.
   */
  async function seedScope() {
    const ids = {
      asset: newId(),
      category: newId(),
      product: newId(),
      side: newId(),
      otherSide: newId(),
      area: newId(),
      otherArea: newId(),
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
    await exec(sql`insert into embroidery_areas
            (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
             bound_height_px, display_order)
          values (${ids.otherArea}, ${ids.otherSide}, 'nape', 'Nape', 100, 100, 400, 300, 1)`);
    return {
      product: ids.product,
      category: ids.category,
      side: ids.side,
      otherSide: ids.otherSide,
      area: ids.area,
      otherArea: ids.otherArea,
    };
  }

  /**
   * A document whose placement agrees with the Side and Area it will be
   * published against. `GRD-T01` validates that agreement, so a document naming
   * a different Area is refused with a 422 — correctly.
   */
  function designDocument(
    text = 'Thêu',
    placement: { side?: string | undefined; area?: string | undefined } = {},
  ): Record<string, unknown> {
    return {
      schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
      placement: {
        productSideId: placement.side ?? scope.side,
        embroideryAreaId: placement.area ?? scope.area,
        canvasWidthPx: 1000,
        canvasHeightPx: 1000,
        physicalWidthMm: 200,
        physicalHeightMm: 200,
        pxPerMm: 5,
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
          text,
          fontId: 'inter',
          fontSizePx: 24,
          fontWeight: 400,
          fontStyle: 'normal',
          textAlign: 'left',
          fill: '#101010',
        },
      ],
    };
  }

  const admin = (path: string) =>
    ctx.http.post(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN);

  /** A PUBLISHED Template holding one published version, through the real APIs. */
  async function publishedTemplate(
    name: string,
    options: {
      area?: string | undefined;
      side?: string | undefined;
      text?: string | undefined;
    } = {},
  ): Promise<{ templateId: string; slug: string }> {
    const created = await admin('/api/admin/design-templates').send({
      name,
      productId: scope.product,
      productSideId: options.side ?? scope.side,
      embroideryAreaId: options.area ?? scope.area,
    });
    expect(created.status).toBe(201);
    const templateId = (created.body as Envelope<AdminTemplatePayload>).data.templateId;

    const saved = await ctx.http
      .put(`/api/admin/design-templates/${templateId}/document`)
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send({
        expectedCurrentVersion: 0,
        document: designDocument(options.text, { side: options.side, area: options.area }),
      });
    expect(saved.status).toBe(200);

    const published = await admin(`/api/admin/design-templates/${templateId}/publish`).send({
      expectedCurrentVersion: 1,
    });
    expect(published.status).toBe(200);

    const [row] = await rows<{ slug: string }>(
      sql`select slug from design_templates where id = ${templateId}`,
    );
    return { templateId, slug: row?.slug ?? '' };
  }

  const list = (query: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      productId: scope.product,
      productSideId: scope.side,
      embroideryAreaId: scope.area,
      ...query,
    })) {
      if (value !== undefined) params.set(key, String(value));
    }
    return ctx.http.get(`${LIST}?${params.toString()}`);
  };

  const detail = (slug: string) => ctx.http.get(`${LIST}/${slug}`);

  const slugsOf = (body: unknown): string[] =>
    (body as Envelope<ListPayload>).data.items.map((item) => item.slug);

  /* ---------------------------------------------------------------------- */

  describe('exact scope', () => {
    it('returns a published template for its own triple, anonymously', async () => {
      const { slug } = await publishedTemplate('Phạm vi chính xác');
      const res = await list();

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(slugsOf(res.body)).toContain(slug);

      const item = (res.body as Envelope<ListPayload>).data.items.find((i) => i.slug === slug);
      expect(item?.scope).toEqual({
        productId: scope.product,
        productSideId: scope.side,
        embroideryAreaId: scope.area,
      });
      expect(item?.publishedVersion.version).toBe(1);
      expect(item?.publishedVersion.publishedAt).toEqual(expect.any(String));
      // A picker's row: no document, and nothing private.
      expect(item).not.toHaveProperty('document');
      expect(JSON.stringify(item)).not.toMatch(/storage_key|storageKey|previewDerivativeId/);
    });

    it('does not return it for another area of the same product', async () => {
      const { slug } = await publishedTemplate('Vùng khác');
      const res = await list({ productSideId: scope.otherSide, embroideryAreaId: scope.otherArea });

      expect(res.status).toBe(200);
      expect(slugsOf(res.body)).not.toContain(slug);
    });

    it('rejects a partial scope rather than broadening the match', async () => {
      for (const missing of ['productId', 'productSideId', 'embroideryAreaId'] as const) {
        const res = await list({ [missing]: undefined });
        expect(res.status).toBe(400);
      }
    });
  });

  describe('the visibility lifecycle', () => {
    it('follows publish → unpublish → republish → archive', async () => {
      const created = await admin('/api/admin/design-templates').send({
        name: 'Vòng đời hiển thị',
        productId: scope.product,
        productSideId: scope.side,
        embroideryAreaId: scope.area,
      });
      const templateId = (created.body as Envelope<AdminTemplatePayload>).data.templateId;
      const slug = await slugOf(sql`select slug from design_templates where id = ${templateId}`);

      const visible = async (): Promise<boolean> => {
        const [page, one] = await Promise.all([list(), detail(slug)]);
        const inList = slugsOf(page.body).includes(slug);
        // A template is never reachable by address while absent from its page.
        expect(inList).toBe(one.status === 200);
        return inList;
      };

      // DRAFT with no version at all.
      expect(await visible()).toBe(false);

      await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 0, document: designDocument() });
      // DRAFT holding an unpublished version.
      expect(await visible()).toBe(false);

      await admin(`/api/admin/design-templates/${templateId}/publish`).send({
        expectedCurrentVersion: 1,
      });
      expect(await visible()).toBe(true);

      await admin(`/api/admin/design-templates/${templateId}/unpublish`).send({
        expectedCurrentVersion: 1,
      });
      // The version keeps its `published_at`; the header no longer says PUBLISHED.
      // A historical stamp alone must never make a non-PUBLISHED header public.
      const [stamped] = await rows<{ published_at: Date | null }>(
        sql`select published_at from design_template_versions
            where design_template_id = ${templateId} and version = 1`,
      );
      expect(stamped?.published_at).not.toBeNull();
      expect(await visible()).toBe(false);

      await admin(`/api/admin/design-templates/${templateId}/publish`).send({
        expectedCurrentVersion: 1,
      });
      expect(await visible()).toBe(true);

      await admin(`/api/admin/design-templates/${templateId}/archive`).send({
        expectedCurrentVersion: 1,
        reason: 'Ngừng cung cấp',
      });
      expect(await visible()).toBe(false);

      // Archived, not deleted: the row and its published version both survive.
      const [survived] = await rows<{ status: string; versions: number }>(
        sql`select t.status,
                   (select count(*) from design_template_versions v
                     where v.design_template_id = t.id) as versions
              from design_templates t where t.id = ${templateId}`,
      );
      expect(survived?.status).toBe('ARCHIVED');
      expect(Number(survived?.versions)).toBe(1);
    });
  });

  describe('published version selection', () => {
    it('selects the highest published version, not the highest version', async () => {
      const { templateId, slug } = await publishedTemplate('Chọn phiên bản', { text: 'v1' });

      // Unpublish, save a second version, publish it.
      await admin(`/api/admin/design-templates/${templateId}/unpublish`).send({
        expectedCurrentVersion: 1,
      });
      await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 1, document: designDocument('v2') });

      // Still DRAFT while v2 is unpublished — and v1's stamp does not resurrect it.
      expect((await detail(slug)).status).toBe(404);

      await admin(`/api/admin/design-templates/${templateId}/publish`).send({
        expectedCurrentVersion: 2,
      });

      const res = await detail(slug);
      expect(res.status).toBe(200);
      const body = (res.body as Envelope<DetailPayload>).data;
      expect(body.publishedVersion.version).toBe(2);
      // Both versions carry a publication stamp; v1 is retained, not selected.
      const stamps = await rows<{ version: number; published_at: Date | null }>(
        sql`select version, published_at from design_template_versions
            where design_template_id = ${templateId} order by version`,
      );
      expect(stamps).toHaveLength(2);
      expect(stamps.every((r) => r.published_at !== null)).toBe(true);
    });

    it('never leaks a higher version that was never published', async () => {
      const { templateId, slug } = await publishedTemplate('Phiên bản chưa xuất bản');

      // A state the delivered lifecycle cannot produce, written directly: a
      // PUBLISHED header whose `current_version` names an *unpublished* version.
      // A read keyed on `current_version` would answer with it.
      await exec(sql`insert into design_template_versions
              (id, design_template_id, version, design_document, document_schema_version, published_at)
            values (${newId()}, ${templateId}, 9, ${JSON.stringify(designDocument('leaked'))}::jsonb,
                    ${CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION}, null)`);
      await exec(sql`update design_templates set current_version = 9 where id = ${templateId}`);

      const res = await detail(slug);
      expect(res.status).toBe(200);
      const body = (res.body as Envelope<DetailPayload>).data;
      expect(body.publishedVersion.version).toBe(1);
      expect(JSON.stringify(body.document)).not.toContain('leaked');
    });

    it('hides a PUBLISHED header whose versions were never published', async () => {
      const created = await admin('/api/admin/design-templates').send({
        name: 'Không có bản xuất bản',
        productId: scope.product,
        productSideId: scope.side,
        embroideryAreaId: scope.area,
      });
      const templateId = (created.body as Envelope<AdminTemplatePayload>).data.templateId;
      const slug = await slugOf(sql`select slug from design_templates where id = ${templateId}`);
      await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 0, document: designDocument() });
      // The header alone, with no publication stamp anywhere beneath it.
      await exec(sql`update design_templates set status = 'PUBLISHED' where id = ${templateId}`);

      expect((await detail(slug)).status).toBe(404);
      expect(slugsOf((await list()).body)).not.toContain(slug);
    });
  });

  describe('current scope eligibility', () => {
    it('hides templates when the Product leaves the public catalogue, unchanged', async () => {
      const { templateId, slug } = await publishedTemplate('Sản phẩm bị ẩn');
      expect((await detail(slug)).status).toBe(200);

      const before = await templateDigest(templateId);
      await exec(sql`update products set status = 'DRAFT' where id = ${scope.product}`);

      expect((await detail(slug)).status).toBe(404);
      expect(slugsOf((await list()).body)).not.toContain(slug);
      // The Template was never touched: same status, same version, same stamp.
      expect(await templateDigest(templateId)).toEqual(before);

      await exec(sql`update products set status = 'PUBLISHED' where id = ${scope.product}`);
      expect((await detail(slug)).status).toBe(200);
    });

    it('hides templates when the category stops being public', async () => {
      const { slug } = await publishedTemplate('Danh mục bị lưu trữ');
      await exec(sql`update categories set archived_at = now() where id = ${scope.category}`);

      expect((await detail(slug)).status).toBe(404);
      expect(slugsOf((await list()).body)).not.toContain(slug);

      await exec(sql`update categories set archived_at = null where id = ${scope.category}`);
      expect((await detail(slug)).status).toBe(200);
    });

    it('hides templates when the Side or the Area is retired', async () => {
      const { slug } = await publishedTemplate('Vùng bị thu hồi');

      await exec(sql`update embroidery_areas set retired_at = now() where id = ${scope.area}`);
      expect((await detail(slug)).status).toBe(404);
      expect(slugsOf((await list()).body)).toEqual([]);
      await exec(sql`update embroidery_areas set retired_at = null where id = ${scope.area}`);

      await exec(sql`update product_sides set retired_at = now() where id = ${scope.side}`);
      expect((await detail(slug)).status).toBe(404);
      await exec(sql`update product_sides set retired_at = null where id = ${scope.side}`);

      expect((await detail(slug)).status).toBe(200);
    });

    async function templateDigest(templateId: string): Promise<unknown> {
      const [row] = await rows<Record<string, unknown>>(
        sql`select t.status, t.current_version, t.archived_at, t.updated_at,
                   (select count(*) from design_template_versions v
                     where v.design_template_id = t.id) as versions,
                   (select count(*) from design_template_versions v
                     where v.design_template_id = t.id and v.published_at is not null) as published
              from design_templates t where t.id = ${templateId}`,
      );
      return row;
    }
  });

  describe('pagination', () => {
    it('pages deterministically and continues without repeating or skipping', async () => {
      const area = newId();
      await exec(sql`insert into embroidery_areas
              (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
               bound_height_px, display_order)
            values (${area}, ${scope.side}, 'sleeve', 'Sleeve', 100, 100, 400, 300, 2)`);

      const slugs: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const { slug } = await publishedTemplate(`Phân trang ${String(index)}`, { area });
        slugs.push(slug);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const res = await list({ embroideryAreaId: area, limit: 2, cursor });
        expect(res.status).toBe(200);
        const body = (res.body as Envelope<ListPayload>).data;
        seen.push(...body.items.map((item) => item.slug));
        if (!body.hasNext) break;
        cursor = body.nextCursor;
      }

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...slugs].sort());
    });

    it('refuses a malformed cursor and one issued for another scope', async () => {
      const first = await list({ limit: 1 });
      const cursor = (first.body as Envelope<ListPayload>).data.nextCursor;

      expect((await list({ cursor: 'not-a-cursor' })).status).toBe(400);
      if (cursor !== undefined) {
        // The same cursor replayed against a different area is a position in a
        // sequence that does not exist.
        const foreign = await list({
          productSideId: scope.otherSide,
          embroideryAreaId: scope.otherArea,
          cursor,
        });
        expect(foreign.status).toBe(400);
      }
    });

    it('refuses an out-of-range page size', async () => {
      expect((await list({ limit: 0 })).status).toBe(400);
      expect((await list({ limit: 101 })).status).toBe(400);
      expect((await list({ limit: 100 })).status).toBe(200);
    });
  });

  describe('safe public non-disclosure', () => {
    it('answers every invisible state with the same 404 and code', async () => {
      const unknown = await detail('khong-ton-tai-bao-gio');
      expect(unknown.status).toBe(404);
      const code = (unknown.body as { code?: string }).code;
      expect(code).toBe('PUBLIC_DESIGN_TEMPLATE_NOT_FOUND');

      const created = await admin('/api/admin/design-templates').send({
        name: 'Bản nháp',
        productId: scope.product,
        productSideId: scope.side,
        embroideryAreaId: scope.area,
      });
      const draftId = (created.body as Envelope<AdminTemplatePayload>).data.templateId;
      const draftSlug = await slugOf(sql`select slug from design_templates where id = ${draftId}`);

      const { templateId: archivedId, slug: archivedSlug } =
        await publishedTemplate('Sẽ bị lưu trữ');
      await admin(`/api/admin/design-templates/${archivedId}/archive`).send({
        expectedCurrentVersion: 1,
        reason: 'Ngừng cung cấp',
      });

      // Code and message, not the whole envelope: `meta` carries a per-request
      // id and timestamp, which differ between any two requests and are not part
      // of what a caller could distinguish these states by.
      const answer = (body: unknown) => {
        const { code: c, message } = body as { code: string; message: string };
        return { code: c, message };
      };
      for (const slug of [draftSlug, archivedSlug]) {
        const res = await detail(slug);
        expect(res.status).toBe(404);
        expect(answer(res.body)).toEqual(answer(unknown.body));
      }
    });

    it('rejects a malformed slug before any lookup', async () => {
      for (const slug of ['Hoa-Sen', 'hoa_sen', 'hoa--sen', 'a'.repeat(81)]) {
        expect((await detail(slug)).status).toBe(400);
      }
    });

    it('needs no credential and offers no lifecycle selector', async () => {
      const { slug } = await publishedTemplate('Ẩn danh');
      // No cookie, no Origin, no Authorization on any request in this suite.
      expect((await detail(slug)).status).toBe(200);
      for (const rejected of ['status=DRAFT', 'includeArchived=true', 'all=true']) {
        const res = await ctx.http.get(
          `${LIST}?productId=${scope.product}&productSideId=${scope.side}` +
            `&embroideryAreaId=${scope.area}&${rejected}`,
        );
        expect(res.status).toBe(400);
      }
    });
  });

  describe('the read-only guarantee', () => {
    it('changes nothing anywhere, across every public read', async () => {
      const { slug } = await publishedTemplate('Chỉ đọc');

      const digest = async () =>
        rows<Record<string, unknown>>(sql`select
            (select count(*) from design_templates) as templates,
            (select count(*) from design_template_versions) as versions,
            (select count(*) from design_template_assets) as template_assets,
            (select count(*) from audit_events) as audit,
            (select count(*) from outbox_events) as outbox,
            (select count(*) from design_sessions) as sessions,
            (select md5(string_agg(t.id::text || t.status || t.current_version::text ||
                                   coalesce(t.archived_at::text, '-') || t.updated_at::text, '|'
                                   order by t.id))
               from design_templates t) as template_state,
            (select md5(string_agg(v.id::text || v.version::text ||
                                   coalesce(v.published_at::text, '-'), '|'
                                   order by v.id))
               from design_template_versions v) as version_state`);

      const before = await digest();

      for (let round = 0; round < 3; round += 1) {
        expect((await list()).status).toBe(200);
        expect((await detail(slug)).status).toBe(200);
        expect((await detail('khong-ton-tai')).status).toBe(404);
        await list({ limit: 1 });
      }

      expect(await digest()).toEqual(before);
    });
  });
});
