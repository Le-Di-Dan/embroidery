/**
 * `APP3-B04A` over HTTP against a disposable PostgreSQL — `TR-LC24-06`,
 * end to end.
 *
 * The whole stack runs, and what is asserted here and nowhere else is what
 * actually reaches the database. Four properties are only provable live:
 *
 * - **`archived_at` is cleared.** DB3 LC-24 defines restore as *"header, clears
 *   `archived_at`"*. That is a column, and only a real row can show it went back
 *   to null while every other column stood still.
 * - **Nothing else moved.** Version rows, their `published_at` stamps, the scope
 *   triple and the asset associations are compared byte for byte across the
 *   transition — the assertion a double cannot make, because a double has no
 *   rows to leave alone.
 * - **The race.** Restore vs restore is a true conflict: `ARCHIVED` is the only
 *   admissible source, so a second one must find the state already gone.
 * - **Public invisibility.** A restored template is a `DRAFT`, and `APP3-B05`
 *   must answer as if it were not there — including one that was public an
 *   instant earlier.
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
const EMAIL = 'template-restore@example.test';
const PASSWORD = 'operator-secret-123';
const REASON = 'Khách hỏi lại mẫu này';

interface Envelope<T> {
  readonly data: T;
}

interface TemplatePayload {
  readonly templateId: string;
  readonly slug: string;
  readonly status: string;
  readonly currentVersion?: { version: number; publishedAt?: string };
  readonly archivedAt?: string;
  readonly scope?: Record<string, string>;
}

interface HeaderRow {
  readonly status: string;
  readonly archived_at: Date | null;
  readonly current_version: number;
  readonly product_id: string | null;
  readonly product_side_id: string | null;
  readonly embroidery_area_id: string | null;
}

interface VersionRow {
  readonly version: number;
  readonly published_at: Date | null;
}

describe('Admin Design Template restore (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;
  let scope: { product: string; side: string; area: string };

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app3b04a-template-restore');
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

  async function seedScope() {
    const ids = {
      asset: newId(),
      category: newId(),
      product: newId(),
      side: newId(),
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
    await exec(sql`insert into product_sides
            (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
             physical_width_mm, physical_height_mm, px_per_mm, display_order)
          values (${ids.side}, ${ids.product}, 'front', 'Front', ${ids.asset}, 1000, 1000,
                  200, 200, 5, 1)`);
    await exec(sql`insert into embroidery_areas
            (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
             bound_height_px, display_order)
          values (${ids.area}, ${ids.side}, 'chest', 'Chest', 100, 100, 400, 300, 1)`);
    return { product: ids.product, side: ids.side, area: ids.area };
  }

  function designDocument(): Record<string, unknown> {
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
      ],
    };
  }

  const post = (templateId: string, action: string, body: Record<string, unknown>) =>
    ctx.http
      .post(`/api/admin/design-templates/${templateId}/${action}`)
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send(body);

  const header = async (templateId: string): Promise<HeaderRow | undefined> => {
    const [row] = await rows<HeaderRow>(
      sql`select status, archived_at, current_version, product_id, product_side_id,
                 embroidery_area_id
          from design_templates where id = ${templateId}`,
    );
    return row;
  };

  const versions = (templateId: string) =>
    rows<VersionRow>(
      sql`select version, published_at from design_template_versions
          where design_template_id = ${templateId} order by version`,
    );

  /**
   * A template in the requested shape, built through the real APIs and then
   * archived — the only state restore accepts.
   */
  async function archivedTemplate(
    name: string,
    shape: 'zero-version' | 'versioned' | 'published',
  ): Promise<{ templateId: string; slug: string; version: number }> {
    const created = await ctx.http
      .post('/api/admin/design-templates')
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send({
        name,
        productId: scope.product,
        productSideId: scope.side,
        embroideryAreaId: scope.area,
      });
    expect(created.status).toBe(201);
    const { templateId, slug } = (created.body as Envelope<TemplatePayload>).data;

    let version = 0;
    if (shape !== 'zero-version') {
      const saved = await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 0, document: designDocument() });
      expect(saved.status).toBe(200);
      version = 1;
    }
    if (shape === 'published') {
      expect((await post(templateId, 'publish', { expectedCurrentVersion: 1 })).status).toBe(200);
    }

    const archived = await post(templateId, 'archive', {
      expectedCurrentVersion: version,
      reason: 'Ngừng bán',
    });
    expect(archived.status).toBe(200);
    return { templateId, slug, version };
  }

  describe('the three archived shapes restore to DRAFT', () => {
    for (const shape of ['zero-version', 'versioned', 'published'] as const) {
      it(`restores an archived ${shape} template, preserving everything else`, async () => {
        const { templateId, version } = await archivedTemplate(`Khôi phục ${shape}`, shape);

        const before = { header: await header(templateId), versions: await versions(templateId) };
        expect(before.header?.status).toBe('ARCHIVED');
        expect(before.header?.archived_at).not.toBeNull();

        const res = await post(templateId, 'restore', {
          expectedCurrentVersion: version,
          reason: REASON,
        });

        expect(res.status).toBe(200);
        const body = (res.body as Envelope<TemplatePayload>).data;
        expect(body.status).toBe('DRAFT');
        // The projection stops reporting an archive marker the row no longer has.
        expect(body.archivedAt).toBeUndefined();

        const after = await header(templateId);
        expect(after?.status).toBe('DRAFT');
        // The current archive-state marker, cleared — the property no double can show.
        expect(after?.archived_at).toBeNull();
        // Every retained fact, untouched.
        expect(after?.current_version).toBe(before.header?.current_version);
        expect(after?.product_id).toBe(scope.product);
        expect(after?.product_side_id).toBe(scope.side);
        expect(after?.embroidery_area_id).toBe(scope.area);
        // Version rows and their publication stamps, byte for byte.
        expect(await versions(templateId)).toEqual(before.versions);
      });
    }

    it('leaves a restored zero-version header with no version at all', async () => {
      const { templateId } = await archivedTemplate('Không phiên bản', 'zero-version');
      await post(templateId, 'restore', { expectedCurrentVersion: 0, reason: REASON });

      expect(await versions(templateId)).toHaveLength(0);
      expect((await header(templateId))?.current_version).toBe(0);
    });

    it('keeps a previously published version stamped, and does not republish', async () => {
      const { templateId } = await archivedTemplate('Từng xuất bản', 'published');
      const [stamped] = await versions(templateId);
      expect(stamped?.published_at).not.toBeNull();

      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      const [after] = await versions(templateId);
      // Set once, never cleared or rewritten — a restore is not an unpublish of
      // the version, and it is certainly not a publication.
      expect(after?.published_at).toEqual(stamped?.published_at);
      expect((await header(templateId))?.status).toBe('DRAFT');
    });
  });

  describe('editability and public visibility after restore', () => {
    it('is editable again — the next save creates the next version', async () => {
      const { templateId } = await archivedTemplate('Sửa lại được', 'versioned');
      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      const saved = await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 1, document: designDocument() });

      expect(saved.status).toBe(200);
      expect((await versions(templateId)).map((row) => row.version)).toEqual([1, 2]);
    });

    it('stays invisible to the public read, including one published a moment ago', async () => {
      const { templateId, slug } = await archivedTemplate('Ẩn với khách', 'published');
      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      // `APP3-B05` selects on the header being PUBLISHED; a restored template is
      // a DRAFT, and a draft is not publicly readable at all.
      const anonymous = await ctx.http.get(`/api/public/design-templates/${slug}`);
      expect(anonymous.status).toBe(404);
    });

    it('needs a fresh publish to become public again, guard and all', async () => {
      const { templateId, slug } = await archivedTemplate('Xuất bản lại', 'published');
      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      expect((await post(templateId, 'publish', { expectedCurrentVersion: 1 })).status).toBe(200);
      expect((await ctx.http.get(`/api/public/design-templates/${slug}`)).status).toBe(200);
    });
  });

  describe('refusals leave the row exactly as it was', () => {
    it('refuses a DRAFT and a PUBLISHED source with a conflict', async () => {
      const { templateId } = await archivedTemplate('Sai trạng thái', 'versioned');
      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      // Now DRAFT: restoring again is not a transition LC-24 recognises.
      expect(
        (await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON })).status,
      ).toBe(409);

      await post(templateId, 'publish', { expectedCurrentVersion: 1 });
      expect(
        (await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON })).status,
      ).toBe(409);
      expect((await header(templateId))?.status).toBe('PUBLISHED');
    });

    it('refuses a stale token with nothing written', async () => {
      const { templateId } = await archivedTemplate('Thẻ cũ', 'versioned');
      const before = await header(templateId);

      const res = await post(templateId, 'restore', { expectedCurrentVersion: 0, reason: REASON });

      expect(res.status).toBe(409);
      expect(await header(templateId)).toEqual(before);
    });

    it('refuses a missing, blank or oversized reason before touching the row', async () => {
      const { templateId } = await archivedTemplate('Thiếu lý do', 'versioned');
      for (const body of [
        { expectedCurrentVersion: 1 },
        { expectedCurrentVersion: 1, reason: '   ' },
        { expectedCurrentVersion: 1, reason: 'x'.repeat(501) },
        { expectedCurrentVersion: 1, reason: REASON, status: 'PUBLISHED' },
      ]) {
        expect((await post(templateId, 'restore', body)).status).toBe(400);
      }
      expect((await header(templateId))?.status).toBe('ARCHIVED');
      expect((await header(templateId))?.archived_at).not.toBeNull();
    });

    it('answers a safe 404 for an unknown template', async () => {
      expect(
        (await post(newId(), 'restore', { expectedCurrentVersion: 0, reason: REASON })).status,
      ).toBe(404);
    });

    it('writes no audit row for any refusal', async () => {
      const { templateId } = await archivedTemplate('Không kiểm toán', 'versioned');
      await post(templateId, 'restore', { expectedCurrentVersion: 99, reason: REASON });
      await post(templateId, 'restore', { expectedCurrentVersion: 1 });

      expect(
        await count(sql`select count(*)::int as count from audit_events
                        where target_id = ${templateId}
                          and action = 'design_template.restored'`),
      ).toBe(0);
    });
  });

  describe('audit and side effects', () => {
    it('writes exactly one bounded reason-bearing row and no outbox event', async () => {
      const outboxBefore = await count(sql`select count(*)::int as count from outbox_events`);
      const { templateId } = await archivedTemplate('Kiểm toán khôi phục', 'published');

      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      const audit = await rows<{
        action: string;
        summary: Record<string, unknown>;
        reason: string | null;
        actor_kind: string;
        admin_id: string | null;
      }>(
        sql`select action, summary, reason, actor_kind, admin_id from audit_events
            where target_id = ${templateId} and action = 'design_template.restored'`,
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]?.summary).toEqual({ from: 'ARCHIVED', to: 'DRAFT', version: 1 });
      expect(audit[0]?.reason).toBe(REASON);
      // Attributed to the acting Admin, taken from the bound request actor.
      expect(audit[0]?.actor_kind).toBe('ADMIN');
      expect(audit[0]?.admin_id).not.toBeNull();
      // The archive it reverses keeps its own row: restore is a new fact.
      expect(
        await count(sql`select count(*)::int as count from audit_events
                        where target_id = ${templateId} and action = 'design_template.archived'`),
      ).toBe(1);
      expect(await count(sql`select count(*)::int as count from outbox_events`)).toBe(outboxBefore);
    });

    it('cascades nothing — no delete, and the Product and its sides are untouched', async () => {
      const { templateId } = await archivedTemplate('Không lan toả', 'versioned');
      const before = {
        templates: await count(sql`select count(*)::int as count from design_templates`),
        sides: await count(
          sql`select count(*)::int as count from product_sides where product_id = ${scope.product}`,
        ),
        assets: await count(
          sql`select count(*)::int as count from design_template_assets
              where design_template_id = ${templateId}`,
        ),
      };

      await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON });

      expect(await count(sql`select count(*)::int as count from design_templates`)).toBe(
        before.templates,
      );
      expect(
        await count(
          sql`select count(*)::int as count from product_sides where product_id = ${scope.product}`,
        ),
      ).toBe(before.sides);
      expect(
        await count(
          sql`select count(*)::int as count from design_template_assets
              where design_template_id = ${templateId}`,
        ),
      ).toBe(before.assets);
    });

    it('preserves a scope whose Side has since been retired, repairing nothing', async () => {
      const { templateId } = await archivedTemplate('Mặt đã ngừng', 'versioned');
      await exec(sql`update product_sides set retired_at = now() where id = ${scope.side}`);

      const res = await post(templateId, 'restore', {
        expectedCurrentVersion: 1,
        reason: REASON,
      });
      await exec(sql`update product_sides set retired_at = null where id = ${scope.side}`);

      // No publication guard runs, so a retired chain does not block the way
      // back to the only state in which it could be fixed.
      expect(res.status).toBe(200);
      const after = await header(templateId);
      expect(after?.status).toBe('DRAFT');
      expect(after?.product_side_id).toBe(scope.side);
    });
  });

  describe('concurrency', () => {
    const ITERATIONS = 5;

    it('restore vs restore leaves exactly one winner and one audit row', async () => {
      for (let index = 0; index < ITERATIONS; index += 1) {
        const { templateId } = await archivedTemplate(
          `Đua khôi phục ${String(index)}`,
          'versioned',
        );

        const [a, b] = await Promise.all([
          post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON }),
          post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON }),
        ]);

        // `ARCHIVED` is the only admissible source, so this is a true conflict:
        // the loser finds a state that is already gone.
        expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
        expect((await header(templateId))?.status).toBe('DRAFT');
        expect((await header(templateId))?.archived_at).toBeNull();
        expect(
          await count(sql`select count(*)::int as count from audit_events
                          where target_id = ${templateId}
                            and action = 'design_template.restored'`),
        ).toBe(1);
      }
    }, 180_000);

    it('restore then archive is two legal transitions, not a lost race', async () => {
      const { templateId } = await archivedTemplate('Khôi phục rồi lưu trữ', 'versioned');

      expect(
        (await post(templateId, 'restore', { expectedCurrentVersion: 1, reason: REASON })).status,
      ).toBe(200);
      // `DRAFT → ARCHIVED` is `TR-LC24-04` and legitimately succeeds after it.
      expect(
        (await post(templateId, 'archive', { expectedCurrentVersion: 1, reason: 'Lại thôi' }))
          .status,
      ).toBe(200);

      const after = await header(templateId);
      expect(after?.status).toBe('ARCHIVED');
      expect(after?.archived_at).not.toBeNull();
    });
  });

  describe('authorization', () => {
    it('refuses restore without an Admin session or from a foreign origin', async () => {
      const { templateId } = await archivedTemplate('Bảo vệ khôi phục', 'versioned');

      const anonymous = await ctx.http
        .post(`/api/admin/design-templates/${templateId}/restore`)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 1, reason: REASON });
      expect(anonymous.status).toBe(401);

      const foreign = await ctx.http
        .post(`/api/admin/design-templates/${templateId}/restore`)
        .set('Cookie', cookie)
        .set('Origin', 'http://evil.example')
        .send({ expectedCurrentVersion: 1, reason: REASON });
      expect(foreign.status).toBe(403);

      expect((await header(templateId))?.status).toBe('ARCHIVED');
    });
  });
});
