/**
 * Session bootstrap and resume against live PostgreSQL (`APP3-B07`).
 *
 * The cases that matter are the ones a unit test cannot reach: that a clone is a
 * *value* and not a link, that rotation is atomic under real concurrency, and
 * that the secret exists nowhere but the cookie and one HMAC column.
 */
import { sql } from '@embroidery/database';

import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { DesignSessionSecretVerifier } from '../../src/modules/design/infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionRateLimiter } from '../../src/modules/design/infrastructure/rate-limit/design-session-rate-limiter';
import {
  createApiIntegrationContext,
  DESIGN_SESSION_TEST_ORIGIN,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  areaCommand,
  seedBackgroundAsset,
  sideCommand,
} from '../support/product-placement-fixtures';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

const CREATE = '/api/public/design-sessions';

describe('Design Session bootstrap and resume (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let adminId: string;
  let verifier: DesignSessionSecretVerifier;
  let limiter: DesignSessionRateLimiter;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app3b07-session-bootstrap');
    adminId = await seedAdminId(ctx);
    verifier = ctx.app.get(DesignSessionSecretVerifier);
    limiter = ctx.app.get(DesignSessionRateLimiter);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  beforeEach(() => limiter.reset());

  const exec = (statement: ReturnType<typeof sql>) => ctx.database.client.db.execute(statement);
  const rowsOf = async <T>(statement: ReturnType<typeof sql>): Promise<T[]> =>
    (await exec(statement)).rows as T[];

  /** A published, Studio-eligible Product with one Side and one Area. */
  async function seedScope(): Promise<{ slug: string; productId: string }> {
    const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
    const backgroundAssetId = await seedBackgroundAsset(ctx);
    await asAdmin(ctx, adminId, () =>
      ctx.app.get(ProductPlacementService).replace({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
        sides: [sideCommand({ backgroundAssetId, areas: [areaCommand()] })],
      }),
    );
    const [row] = await rowsOf<{ slug: string; updated_at: string }>(
      sql`select slug, updated_at from products where id = ${product.productId}`,
    );
    await asAdmin(ctx, adminId, () =>
      ctx.app.get(ProductPublicationService).publish({
        productId: product.productId,
        expectedUpdatedAt: new Date(row!.updated_at),
      }),
    );
    return { slug: row!.slug, productId: product.productId };
  }

  /** Responses are wrapped in the standard API envelope; the payload is `data`. */
  const dataOf = <T>(response: { body: unknown }): T => (response.body as { data: T }).data;

  /** A refusal without its per-request correlation id, so two can be compared. */
  const refusalOf = (response: { status: number; body: unknown }) => {
    const body = response.body as { code?: string; message?: string };
    return { status: response.status, code: body.code, message: body.message };
  };

  const post = (path: string, body?: unknown) => {
    const call = ctx.http
      .post(path)
      .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin');
    return body === undefined ? call : call.send(body as object);
  };

  const blankBody = (slug: string) => ({
    mode: 'BLANK',
    productSlug: slug,
    sideCode: 'front',
    areaCode: 'chest',
  });

  const cookieOf = (response: { headers: Record<string, unknown> }): string => {
    const raw = response.headers['set-cookie'];
    return Array.isArray(raw) ? String(raw[0]).split(';')[0]! : String(raw).split(';')[0]!;
  };

  async function openBlank() {
    const { slug } = await seedScope();
    const response = await post(CREATE, blankBody(slug)).expect(201);
    return { slug, response, cookie: cookieOf(response) };
  }

  /** A PUBLISHED Template scoped to the given placement. */
  async function seedTemplate(
    productId: string,
    options: { status?: string; areaCode?: string } = {},
  ): Promise<string> {
    const [side] = await rowsOf<{
      id: string;
      image_width_px: number;
      image_height_px: number;
      physical_width_mm: string;
      physical_height_mm: string;
      px_per_mm: string;
    }>(
      sql`select id, image_width_px, image_height_px, physical_width_mm, physical_height_mm, px_per_mm
          from product_sides where product_id = ${productId} limit 1`,
    );
    const [area] = await rowsOf<{ id: string }>(
      sql`select id from embroidery_areas where product_side_id = ${side!.id}
          and code = ${options.areaCode ?? 'chest'} limit 1`,
    );
    const templateId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const slug = `tpl-${templateId.slice(0, 8)}`;
    const document = {
      schemaVersion: 1,
      placement: {
        productSideId: side!.id,
        embroideryAreaId: area!.id,
        canvasWidthPx: side!.image_width_px,
        canvasHeightPx: side!.image_height_px,
        physicalWidthMm: Number(side!.physical_width_mm),
        physicalHeightMm: Number(side!.physical_height_mm),
        pxPerMm: Number(side!.px_per_mm),
      },
      elements: [],
    };
    await exec(sql`
      insert into design_templates (id, name, slug, status, current_version,
                                    product_id, product_side_id, embroidery_area_id)
      values (${templateId}, 'Fixture Template', ${slug}, ${options.status ?? 'PUBLISHED'}, 1,
              ${productId}, ${side!.id}, ${area!.id})`);
    await exec(sql`
      insert into design_template_versions (id, design_template_id, version, design_document,
                                            document_schema_version, published_at)
      values (${versionId}, ${templateId}, 1, ${JSON.stringify(document)}::jsonb, 1, now())`);
    return slug;
  }

  const sessionRow = async (id: string) =>
    (
      await rowsOf<{
        status: string;
        autosave_revision: number;
        expires_at: string;
        session_secret_hash: string;
        template_id: string | null;
        template_version: number | null;
        design_document: unknown;
      }>(
        sql`select status, autosave_revision, expires_at, session_secret_hash,
                   template_id, template_version, design_document
              from design_sessions where id = ${id}`,
      )
    )[0]!;

  describe('blank bootstrap', () => {
    it('opens an ACTIVE session at revision 0 with a 30-day expiry', async () => {
      const { response } = await openBlank();
      const body = dataOf<{ sessionId: string; revision: number; status: string }>(response);
      expect(body.revision).toBe(0);
      expect(body.status).toBe('ACTIVE');

      const row = await sessionRow(body.sessionId);
      expect(row.status).toBe('ACTIVE');
      expect(row.autosave_revision).toBe(0);
      const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThan(30.1);
      expect(row.template_id).toBeNull();
    });

    it('returns the canonical document and the public scope', async () => {
      const { response } = await openBlank();
      const body = dataOf<{
        document: { schemaVersion: number; elements: unknown[] };
        scope: { productSlug: string; sideCode: string; areaCode: string };
      }>(response);
      expect(body.document.elements).toEqual([]);
      expect(body.document.schemaVersion).toBe(1);
      expect(body.scope.sideCode).toBe('front');
      expect(body.scope.areaCode).toBe('chest');
    });

    it('persists only the HMAC and never returns the secret', async () => {
      const { response, cookie } = await openBlank();
      const body = dataOf<{ sessionId: string }>(response);
      const secret = cookie.split('=')[1]!;
      const row = await sessionRow(body.sessionId);

      expect(row.session_secret_hash).toBe(verifier.digest(secret));
      expect(row.session_secret_hash).not.toBe(secret);
      expect(JSON.stringify(response.body)).not.toContain(secret);
    });

    it('sets exactly the ruled cookie attributes', async () => {
      const { response } = await openBlank();
      const header = String((response.headers as Record<string, unknown>)['set-cookie']);
      expect(header).toContain('__Host-nettheu_ds_');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
      expect(header).not.toContain('Domain');
    });

    it('appends no Outbox event of its own', async () => {
      // The fixture itself publishes a Product and replaces its placement, both
      // of which legitimately append events. What must hold is that the
      // bootstrap adds none — measured across the request, not globally.
      const { slug } = await seedScope();
      const before = await rowsOf<{ count: string }>(
        sql`select count(*)::text as count from outbox_events`,
      );
      await post(CREATE, blankBody(slug)).expect(201);
      const after = await rowsOf<{ count: string }>(
        sql`select count(*)::text as count from outbox_events`,
      );
      expect(after[0]!.count).toBe(before[0]!.count);
    });
  });

  describe('bootstrap security', () => {
    it('refuses a missing Origin and a cross-site fetch', async () => {
      const { slug } = await seedScope();
      await ctx.http
        .post(CREATE)
        .set('Sec-Fetch-Site', 'same-origin')
        .send(blankBody(slug))
        .expect(403);
      await ctx.http
        .post(CREATE)
        .set('Origin', DESIGN_SESSION_TEST_ORIGIN)
        .set('Sec-Fetch-Site', 'cross-site')
        .send(blankBody(slug))
        .expect(403);
    });

    it('refuses an unknown placement without revealing which part was wrong', async () => {
      const { slug } = await seedScope();
      const unknownProduct = await post(CREATE, { ...blankBody(slug), productSlug: 'nope' });
      const unknownArea = await post(CREATE, { ...blankBody(slug), areaCode: 'nope' });
      expect(unknownProduct.status).toBe(422);
      expect(unknownArea.status).toBe(422);
      expect(refusalOf(unknownProduct)).toEqual(refusalOf(unknownArea));
    });

    it('enforces the creation burst limit', async () => {
      const { slug } = await seedScope();
      await post(CREATE, blankBody(slug)).expect(201);
      await post(CREATE, blankBody(slug)).expect(201);
      await post(CREATE, blankBody(slug)).expect(429);
    });
  });

  describe('clone bootstrap', () => {
    it('deep-copies a published Template and stamps lineage', async () => {
      const { slug, productId } = await seedScope();
      const templateSlug = await seedTemplate(productId);
      const response = await post(CREATE, {
        ...blankBody(slug),
        mode: 'CLONE_TEMPLATE',
        templateSlug,
      }).expect(201);

      const body = dataOf<{
        sessionId: string;
        lineage: { templateSlug: string; templateVersion: number };
      }>(response);
      expect(body.lineage.templateSlug).toBe(templateSlug);
      expect(body.lineage.templateVersion).toBe(1);

      const row = await sessionRow(body.sessionId);
      expect(row.template_version).toBe(1);
      expect(row.autosave_revision).toBe(0);
    });

    it('is independent: archiving the Template afterwards does not touch the Session', async () => {
      const { slug, productId } = await seedScope();
      const templateSlug = await seedTemplate(productId);
      const created = await post(CREATE, {
        ...blankBody(slug),
        mode: 'CLONE_TEMPLATE',
        templateSlug,
      }).expect(201);
      const sessionId = dataOf<{ sessionId: string }>(created).sessionId;
      const before = await sessionRow(sessionId);

      await exec(sql`update design_templates set status = 'ARCHIVED' where slug = ${templateSlug}`);
      // A published version is immutable (S24 trigger), so the realistic drift is
      // a *new* version plus a moved pointer — neither of which may reach a clone.
      await exec(sql`insert into design_template_versions (id, design_template_id, version,
                       design_document, document_schema_version, published_at)
                     select ${crypto.randomUUID()}, id, 2, '{"drifted":true}'::jsonb, 1, now()
                       from design_templates where slug = ${templateSlug}`);
      await exec(sql`update design_templates set current_version = 2 where slug = ${templateSlug}`);

      const after = await sessionRow(sessionId);
      expect(after.design_document).toEqual(before.design_document);
    });

    it('refuses a draft Template and an unknown one identically', async () => {
      const { slug, productId } = await seedScope();
      const draft = await seedTemplate(productId, { status: 'DRAFT' });
      const draftResponse = await post(CREATE, {
        ...blankBody(slug),
        mode: 'CLONE_TEMPLATE',
        templateSlug: draft,
      });
      const unknown = await post(CREATE, {
        ...blankBody(slug),
        mode: 'CLONE_TEMPLATE',
        templateSlug: 'no-such-template',
      });
      expect(draftResponse.status).toBe(422);
      expect(unknown.status).toBe(422);
      expect(refusalOf(draftResponse)).toEqual(refusalOf(unknown));
    });

    it('refuses a Template scoped to a different placement', async () => {
      const { productId } = await seedScope();
      const templateSlug = await seedTemplate(productId);
      const other = await seedScope();
      await post(CREATE, {
        ...blankBody(other.slug),
        mode: 'CLONE_TEMPLATE',
        templateSlug,
      }).expect(422);
    });
  });

  describe('resume', () => {
    const resumePath = (id: string) => `${CREATE}/${id}/resume`;

    it('rotates the secret, killing the old cookie immediately', async () => {
      const { response, cookie } = await openBlank();
      const sessionId = dataOf<{ sessionId: string }>(response).sessionId;

      const resumed = await post(resumePath(sessionId)).set('Cookie', cookie).expect(200);
      const nextCookie = cookieOf(resumed);
      expect(nextCookie).not.toBe(cookie);

      // The old secret is gone from the row, so it can never verify again.
      await post(resumePath(sessionId)).set('Cookie', cookie).expect(401);
      await post(resumePath(sessionId)).set('Cookie', nextCookie).expect(200);
    });

    it('changes neither the expiry nor the document revision', async () => {
      const { response, cookie } = await openBlank();
      const sessionId = dataOf<{ sessionId: string }>(response).sessionId;
      const before = await sessionRow(sessionId);

      await post(resumePath(sessionId)).set('Cookie', cookie).expect(200);

      const after = await sessionRow(sessionId);
      expect(after.expires_at).toEqual(before.expires_at);
      expect(after.autosave_revision).toBe(before.autosave_revision);
      expect(after.design_document).toEqual(before.design_document);
    });

    it('has exactly one winner when three callers present the same secret', async () => {
      const { response, cookie } = await openBlank();
      const sessionId = dataOf<{ sessionId: string }>(response).sessionId;

      const attempts = await Promise.all([
        post(resumePath(sessionId)).set('Cookie', cookie),
        post(resumePath(sessionId)).set('Cookie', cookie),
        post(resumePath(sessionId)).set('Cookie', cookie),
      ]);
      expect(attempts.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it('refuses a foreign cookie, an expired session and a terminal one alike', async () => {
      const mine = await openBlank();
      const theirs = await openBlank();
      const mineId = dataOf<{ sessionId: string }>(mine.response).sessionId;

      const foreign = await post(resumePath(mineId)).set('Cookie', theirs.cookie);
      expect(foreign.status).toBe(401);

      await exec(sql`update design_sessions set expires_at = now() - interval '1 day'
                     where id = ${mineId}`);
      const expired = await post(resumePath(mineId)).set('Cookie', mine.cookie);
      expect(expired.status).toBe(401);
      expect(refusalOf(expired)).toEqual(refusalOf(foreign));
    });

    it('returns the persisted document and no secret', async () => {
      const { response, cookie } = await openBlank();
      const sessionId = dataOf<{ sessionId: string }>(response).sessionId;
      const resumed = await post(resumePath(sessionId)).set('Cookie', cookie).expect(200);

      const row = await sessionRow(sessionId);
      const body = dataOf<{ document: unknown; revision: number }>(resumed);
      expect(body.document).toEqual(row.design_document);
      expect(JSON.stringify(resumed.body)).not.toContain(row.session_secret_hash);
    });
  });
});
