/**
 * `APP3-B03A` over HTTP against a disposable PostgreSQL — the draft document
 * save, end to end.
 *
 * The whole stack runs: the Admin guard, the Zod pipe, the response envelope,
 * the exception filter and real SQL. What is asserted here and nowhere else is
 * what actually reaches the database — above all the compare-and-set, which a
 * doubled repository can only ever agree with.
 *
 * The race block is the point of the suite. Two writers send the same
 * `expectedCurrentVersion` with two different documents, ten times in one
 * invocation, and every iteration must leave exactly one winner, one 409, one
 * new version row and the winner's document persisted whole. A single pass would
 * not distinguish a correct CAS from a lucky interleaving.
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
const EMAIL = 'template-saves@example.test';
const PASSWORD = 'operator-secret-123';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly data: T;
}

interface TemplatePayload {
  readonly templateId: string;
  readonly status: string;
  readonly currentVersion?: { version: number; documentSchemaVersion: number };
  readonly document?: { elements?: unknown[] };
}

describe('Admin Design Template draft save (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app3b03a-template-save');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    cookie = await login();
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

  /** A DRAFT header with no version, created through the accepted B03 API. */
  async function createTemplate(name: string): Promise<string> {
    const res = await ctx.http
      .post('/api/admin/design-templates')
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send({ name });
    expect(res.status).toBe(201);
    return (res.body as Envelope<TemplatePayload>).data.templateId;
  }

  /**
   * One `TEMPLATE_SOURCE` Asset with a measured READY NORMALIZED derivative.
   *
   * Seeded with SQL because no accepted API creates a `TEMPLATE_SOURCE` Asset —
   * `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01`. The row is exactly what such an
   * intake would produce, so the save semantics are proved against the real
   * shape rather than a stand-in.
   */
  async function seedTemplateAsset(
    widthPx = 800,
    heightPx = 600,
  ): Promise<{ assetId: string; derivativeId: string }> {
    const assetId = newId();
    const derivativeId = newId();
    await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
          values (${assetId}, 'TEMPLATE_SOURCE', 'PRODUCTION_SENSITIVE',
                  ${`templates/originals/${assetId}.png`}, 'image/png', 51200, 'ACCEPTED')`);
    await exec(sql`insert into asset_derivatives
            (id, asset_id, kind, status, storage_key, is_watermarked,
             width_px, height_px, media_type, byte_size)
          values (${derivativeId}, ${assetId}, 'NORMALIZED', 'READY',
                  ${`templates/derivatives/${assetId}.webp`}, false,
                  ${widthPx}, ${heightPx}, 'image/webp', 40960)`);
    return { assetId, derivativeId };
  }

  function designDocument(
    elements: readonly unknown[] = [],
    text = 'Thêu',
  ): Record<string, unknown> {
    return {
      schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
      placement: {
        productSideId: 'side-front',
        embroideryAreaId: 'area-chest',
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
          transform: { x: 10, y: 20, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1 },
          text,
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

  function imageElement(assetId: string, derivativeId: string): Record<string, unknown> {
    return {
      id: 'image-1',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 10, y: 20, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1 },
      assetId,
      derivativeId,
      intrinsicWidthPx: 800,
      intrinsicHeightPx: 600,
    };
  }

  const save = (templateId: string, body: Record<string, unknown>) =>
    ctx.http
      .put(`/api/admin/design-templates/${templateId}/document`)
      .set('Cookie', cookie)
      .set('Origin', ADMIN_ORIGIN)
      .send(body);

  describe('the first save', () => {
    it('turns a zero-version header into version 1 with published_at null', async () => {
      const templateId = await createTemplate('Lưu lần đầu');
      const res = await save(templateId, {
        expectedCurrentVersion: 0,
        document: designDocument(),
      });

      expect(res.status).toBe(200);
      const body = res.body as Envelope<TemplatePayload>;
      expect(body.data.currentVersion?.version).toBe(1);
      expect(body.data.status).toBe('DRAFT');

      const [header] = await rows<{ status: string; current_version: number }>(
        sql`select status, current_version from design_templates where id = ${templateId}`,
      );
      expect(header).toEqual({ status: 'DRAFT', current_version: 1 });

      const versions = await rows<{ version: number; published_at: Date | null }>(
        sql`select version, published_at from design_template_versions
            where design_template_id = ${templateId}`,
      );
      expect(versions).toHaveLength(1);
      expect(versions[0]?.version).toBe(1);
      // Publication is APP3-B04's and stamps this once, later.
      expect(versions[0]?.published_at).toBeNull();
    });

    it('persists the canonical document, not the request body', async () => {
      const templateId = await createTemplate('Chuẩn hoá');
      // A value quantization must move: P01 rounds to the APP0-R01 grid.
      const document = designDocument();
      (document['placement'] as Record<string, unknown>)['pxPerMm'] = 5.00000000001;
      await save(templateId, { expectedCurrentVersion: 0, document });

      const [stored] = await rows<{ design_document: Record<string, unknown> }>(
        sql`select design_document from design_template_versions
            where design_template_id = ${templateId} and version = 1`,
      );
      const placement = stored?.design_document?.['placement'] as Record<string, unknown>;
      expect(placement['pxPerMm']).toBe(5);
    });

    it('writes one bounded audit row carrying no document', async () => {
      const templateId = await createTemplate('Kiểm toán lưu');
      await save(templateId, { expectedCurrentVersion: 0, document: designDocument() });

      const audit = await rows<{ action: string; summary: Record<string, unknown> }>(
        sql`select action, summary from audit_events
            where target_id = ${templateId} and action = 'design_template.version_saved'`,
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]?.summary).toEqual({ version: 1 });
    });
  });

  describe('sequential saves', () => {
    it('advances 1 to 2 to 3 and never rewrites an earlier version', async () => {
      const templateId = await createTemplate('Nhiều phiên bản');
      for (let expected = 0; expected < 3; expected += 1) {
        const res = await save(templateId, {
          expectedCurrentVersion: expected,
          document: designDocument([], `Bản ${String(expected + 1)}`),
        });
        expect(res.status).toBe(200);
      }

      const versions = await rows<{ version: number; design_document: { elements: unknown[] } }>(
        sql`select version, design_document from design_template_versions
            where design_template_id = ${templateId} order by version`,
      );
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
      // Version 1 still holds what version 1 was saved with.
      const first = versions[0]?.design_document.elements[0] as { text: string };
      expect(first.text).toBe('Bản 1');
    });

    it('answers 409 for a stale expected version and writes nothing', async () => {
      const templateId = await createTemplate('Xung đột');
      await save(templateId, { expectedCurrentVersion: 0, document: designDocument() });

      const before = await count(
        sql`select count(*)::int as count from design_template_versions
            where design_template_id = ${templateId}`,
      );
      const res = await save(templateId, {
        expectedCurrentVersion: 0,
        document: designDocument([], 'Không được lưu'),
      });
      expect(res.status).toBe(409);

      expect(
        await count(sql`select count(*)::int as count from design_template_versions
                        where design_template_id = ${templateId}`),
      ).toBe(before);
      const [header] = await rows<{ current_version: number }>(
        sql`select current_version from design_templates where id = ${templateId}`,
      );
      expect(header?.current_version).toBe(1);
    });

    it('refuses a non-DRAFT template with a conflict and no version', async () => {
      const templateId = await createTemplate('Đã lưu trữ');
      await exec(sql`update design_templates set status = 'ARCHIVED' where id = ${templateId}`);

      const res = await save(templateId, { expectedCurrentVersion: 0, document: designDocument() });
      expect(res.status).toBe(409);
      expect(
        await count(sql`select count(*)::int as count from design_template_versions
                        where design_template_id = ${templateId}`),
      ).toBe(0);
    });

    it('refuses an unknown template and a malformed document', async () => {
      expect(
        (await save(newId(), { expectedCurrentVersion: 0, document: designDocument() })).status,
      ).toBe(404);

      const templateId = await createTemplate('Tài liệu hỏng');
      expect(
        (await save(templateId, { expectedCurrentVersion: 0, document: { x: 1 } })).status,
      ).toBe(422);
      expect(
        (await save(templateId, { expectedCurrentVersion: 0, document: { schemaVersion: 99 } }))
          .status,
      ).toBe(422);
      expect(
        (await save(templateId, { expectedCurrentVersion: -1, document: designDocument() })).status,
      ).toBe(400);
    });
  });

  describe('Template Asset associations and normalization', () => {
    it('associates a referenced asset and appends exactly one normalization request', async () => {
      const templateId = await createTemplate('Có ảnh');
      const { assetId, derivativeId } = await seedTemplateAsset();

      const res = await save(templateId, {
        expectedCurrentVersion: 0,
        document: designDocument([imageElement(assetId, derivativeId)]),
      });
      expect(res.status).toBe(200);

      const associations = await rows<{ id: string; asset_id: string }>(
        sql`select id, asset_id from design_template_assets
            where design_template_id = ${templateId}`,
      );
      expect(associations).toHaveLength(1);
      expect(associations[0]?.asset_id).toBe(assetId);

      const events = await rows<{
        payload: Record<string, unknown>;
        payload_schema_version: number;
      }>(
        sql`select payload, payload_schema_version from outbox_events
            where event_type = 'asset.normalization.requested'
              and aggregate_id = ${assetId}::text`,
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.payload_schema_version).toBe(1);
      expect(events[0]?.payload).toEqual({
        schemaVersion: 1,
        assetId,
        normalizationPolicyVersion: 1,
        associationRef: {
          kind: 'DESIGN_TEMPLATE_ASSET',
          designTemplateAssetId: associations[0]?.id,
        },
      });
    });

    it('appends no second event when the same asset is saved again', async () => {
      const templateId = await createTemplate('Ảnh lặp lại');
      const { assetId, derivativeId } = await seedTemplateAsset();
      const document = designDocument([imageElement(assetId, derivativeId)]);

      await save(templateId, { expectedCurrentVersion: 0, document });
      await save(templateId, { expectedCurrentVersion: 1, document });

      expect(
        await count(sql`select count(*)::int as count from design_template_assets
                        where design_template_id = ${templateId}`),
      ).toBe(1);
      expect(
        await count(sql`select count(*)::int as count from outbox_events
                        where event_type = 'asset.normalization.requested'
                          and aggregate_id = ${assetId}::text`),
      ).toBe(1);
    });

    it('keeps the association when a later version drops the image', async () => {
      // Provenance: an older immutable version still references the Asset.
      const templateId = await createTemplate('Bỏ ảnh');
      const { assetId, derivativeId } = await seedTemplateAsset();
      await save(templateId, {
        expectedCurrentVersion: 0,
        document: designDocument([imageElement(assetId, derivativeId)]),
      });
      await save(templateId, { expectedCurrentVersion: 1, document: designDocument() });

      expect(
        await count(sql`select count(*)::int as count from design_template_assets
                        where design_template_id = ${templateId}`),
      ).toBe(1);
    });

    it('refuses an Asset outside the TEMPLATE_SOURCE lane, writing nothing', async () => {
      const templateId = await createTemplate('Ảnh sai làn');
      const assetId = newId();
      const derivativeId = newId();
      // A customer upload, measured and READY — ineligible only because of its lane.
      await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
            values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE',
                    ${`sessions/${assetId}.png`}, 'image/png', 51200, 'ACCEPTED')`);
      await exec(sql`insert into asset_derivatives
              (id, asset_id, kind, status, storage_key, is_watermarked,
               width_px, height_px, media_type, byte_size)
            values (${derivativeId}, ${assetId}, 'NORMALIZED', 'READY',
                    ${`sessions/derivatives/${assetId}.webp`}, false, 800, 600, 'image/webp', 40960)`);

      const res = await save(templateId, {
        expectedCurrentVersion: 0,
        document: designDocument([imageElement(assetId, derivativeId)]),
      });
      expect(res.status).toBe(422);
      expect(
        await count(sql`select count(*)::int as count from design_template_assets
                        where design_template_id = ${templateId}`),
      ).toBe(0);
      expect(
        await count(sql`select count(*)::int as count from design_template_versions
                        where design_template_id = ${templateId}`),
      ).toBe(0);
    });
  });

  describe('the compare-and-set race', () => {
    it('leaves exactly one winner and one 409 across ten iterations', async () => {
      const templateId = await createTemplate('Đua ghi');

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const expected = iteration;
        const [a, b] = await Promise.all([
          save(templateId, {
            expectedCurrentVersion: expected,
            document: designDocument([], `A-${String(iteration)}`),
          }),
          save(templateId, {
            expectedCurrentVersion: expected,
            document: designDocument([], `B-${String(iteration)}`),
          }),
        ]);

        const statuses = [a.status, b.status].sort((x, y) => x - y);
        expect(statuses).toEqual([200, 409]);

        const winner = a.status === 200 ? a : b;
        const expectedVersion = expected + 1;

        const [header] = await rows<{ current_version: number }>(
          sql`select current_version from design_templates where id = ${templateId}`,
        );
        expect(header?.current_version).toBe(expectedVersion);

        const versionRows = await rows<{ design_document: { elements: { text?: string }[] } }>(
          sql`select design_document from design_template_versions
              where design_template_id = ${templateId} and version = ${expectedVersion}`,
        );
        // Exactly one row at this number, and it is the winner's whole document.
        expect(versionRows).toHaveLength(1);
        const persistedText = versionRows[0]?.design_document.elements[0]?.text;
        const winnerText = (winner.body as Envelope<TemplatePayload>).data.document
          ?.elements?.[0] as { text?: string } | undefined;
        expect(persistedText).toBe(winnerText?.text);
        expect(persistedText).toBe(`${winner === a ? 'A' : 'B'}-${String(iteration)}`);
      }

      // Ten iterations, ten versions — the loser never added one.
      expect(
        await count(sql`select count(*)::int as count from design_template_versions
                        where design_template_id = ${templateId}`),
      ).toBe(10);
      expect(
        await count(sql`select count(*)::int as count from audit_events
                        where target_id = ${templateId}
                          and action = 'design_template.version_saved'`),
      ).toBe(10);
    }, 180_000);
  });

  describe('authorization and privacy', () => {
    it('refuses the save without an Admin session and from a foreign origin', async () => {
      const templateId = await createTemplate('Bảo vệ');
      const anonymous = await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Origin', ADMIN_ORIGIN)
        .send({ expectedCurrentVersion: 0, document: designDocument() });
      expect(anonymous.status).toBe(401);

      const foreign = await ctx.http
        .put(`/api/admin/design-templates/${templateId}/document`)
        .set('Cookie', cookie)
        .set('Origin', 'http://evil.example')
        .send({ expectedCurrentVersion: 0, document: designDocument() });
      expect(foreign.status).toBe(403);
    });

    it('leaks no storage identity in the save response', async () => {
      const templateId = await createTemplate('Không rò rỉ khi lưu');
      const { assetId, derivativeId } = await seedTemplateAsset();
      const res = await save(templateId, {
        expectedCurrentVersion: 0,
        document: designDocument([imageElement(assetId, derivativeId)]),
      });

      const text = JSON.stringify(res.body);
      for (const leak of ['storageKey', 'storage_key', 'bucket', 'templates/originals']) {
        expect(text).not.toContain(leak);
      }
    });
  });
});
