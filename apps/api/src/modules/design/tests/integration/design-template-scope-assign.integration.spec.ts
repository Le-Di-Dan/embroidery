/**
 * `APP3-B03B` — initial Design Template scope assignment, through the whole HTTP
 * stack against a real PostgreSQL instance.
 *
 * The unit suite proves the *decision*; this proves the parts only a database
 * and a running pipeline can: that the compare-and-set predicate is the SQL it
 * claims to be, that a refusal leaves every column untouched, that the Audit row
 * and the scope commit or roll back together, and that two concurrent
 * assignments produce exactly one winner.
 *
 * The application is assembled from the same modules production uses —
 * `ValidationModule`, `RequestContextModule`, `HttpResponseModule` and
 * `DesignTemplateAdminModule` — so the status codes, the envelope and the Zod
 * rejection under test are the real ones. Only the three staff guards are
 * replaced, and the admin guard's stand-in binds the actor through the *same*
 * `createAdminActor` factory the real guard uses, so the Audit row is written
 * from a genuine ALS-bound actor rather than a fixture.
 */
import { newId } from '@embroidery/database';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';

import { sql } from 'drizzle-orm';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { createAdminActor } from '../../../../platform/actor-context/request-actor';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { AuthenticatedAdminGuard } from '../../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../../identity/presentation/guards/staff-origin.guard';
import { DesignTemplateAdminModule } from '../../design-template-admin.module';
import { seedDesignChain } from './design-fixture';

const ADMIN_ID = newId();

/** Binds the ADMIN actor exactly as the real guard does, without a cookie. */
class StubAdminGuard implements CanActivate {
  constructor(private readonly requestContext: RequestContextService) {}

  canActivate(_context: ExecutionContext): boolean {
    this.requestContext.bindActor(createAdminActor(ADMIN_ID));
    return true;
  }
}

class AllowGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

interface Seeded {
  readonly productId: string;
  readonly sideId: string;
  readonly areaId: string;
  readonly otherSideId: string;
  readonly otherAreaId: string;
  readonly retiredSideId: string;
  readonly retiredAreaId: string;
}

describe('APP3-B03B initial scope assignment (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let seeded: Seeded;
  let previousUrl: string | undefined;
  let previousEnv: string | undefined;

  const db = () => disposable.client.db;
  /**
   * The HTTP server, typed.
   *
   * `getHttpServer()` is `any`, and letting that flow into supertest makes every
   * request an unchecked call — the assertions would still run, but nothing
   * would notice if the handle stopped being a server.
   */
  const server = () => app.getHttpServer() as Server;

  /** The envelope's `data`, named so the assertions are not `any` member reads. */
  function envelopeData(payload: unknown): {
    readonly status?: string;
    readonly scope?: Record<string, string>;
    readonly currentVersion?: unknown;
    readonly document?: unknown;
  } {
    return (payload as { data: Record<string, never> }).data;
  }
  const route = (templateId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/design-templates/${templateId}/scope`;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app3-b03b-scope');
    previousUrl = process.env['DATABASE_URL'];
    previousEnv = process.env['NODE_ENV'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        // `AuditContextModule` supplies the clock the Audit recorder stamps
        // with. In production it reaches the module through `AppModule`; the
        // testing graph has to name it, which is the only difference between
        // this composition and the real one.
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        DesignTemplateAdminModule,
      ],
    })
      .overrideGuard(AuthenticatedAdminGuard)
      .useFactory({
        factory: (requestContext: RequestContextService) => new StubAdminGuard(requestContext),
        inject: [RequestContextService],
      })
      .overrideGuard(StaffOriginGuard)
      .useClass(AllowGuard)
      .overrideGuard(StaffJsonBodyGuard)
      .useClass(AllowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await disposable?.drop();
    if (previousUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousUrl;
    if (previousEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousEnv;
  });

  beforeEach(async () => {
    await truncateAllTables(disposable.client.db);
    seeded = await seedCatalog();
  });

  /**
   * The shared design chain, plus the extra rows this suite needs.
   *
   * `seedDesignChain` already builds one complete Product → Side → Area chain
   * and is the fixture every other design integration suite uses, so reusing it
   * keeps the shapes from drifting. What it does not have is a *second* live
   * Side/Area pair and a *retired* pair, which are what the "does not resolve"
   * cases need — those are added here in the fixture's own style.
   *
   * The Product is moved to `DRAFT` on purpose: publication readiness is
   * `GRD-T01` and belongs to `APP3-B04`, so an unpublished Product must still be
   * assignable, and the fixture's PUBLISHED default would hide that.
   */
  async function seedCatalog(): Promise<Seeded> {
    // `audit_events.admin_id` carries a restrict FK to `admin_accounts`
    // (REL-105), so the actor must be a real row or the Audit write fails —
    // which is itself part of what this suite proves.
    await db().execute(sql`
      INSERT INTO admin_accounts (id, email, display_name, status)
      VALUES (${ADMIN_ID}, ${`b03b-${ADMIN_ID}@example.test`}, 'B03B Admin', 'ACTIVE')
      ON CONFLICT DO NOTHING
    `);

    const fixture = await seedDesignChain({ disposable });
    const { productId, productSideId: sideId, embroideryAreaId: areaId } = fixture.placement;

    await db().execute(sql`UPDATE products SET status = 'DRAFT' WHERE id = ${productId}`);

    const otherSideId = newId();
    const otherAreaId = newId();
    const retiredSideId = newId();
    const retiredAreaId = newId();

    // `code` is the stable machine identity `APP3-DB01` added; it is `NOT NULL`
    // and unique per parent, so each extra row needs its own.
    for (const [id, code, name, order, retired] of [
      [otherSideId, 'back', 'Back', 2, null],
      [retiredSideId, 'retired-side', 'Retired', 3, new Date().toISOString()],
    ] as const) {
      await db().execute(sql`
        insert into product_sides
          (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
           physical_width_mm, physical_height_mm, px_per_mm, display_order, retired_at)
        values (${id}, ${productId}, ${code}, ${name}, ${fixture.assetId}, 1000, 1200, 400, 480,
                2.5, ${order}, ${retired})
      `);
    }

    for (const [id, side, code, name, order, retired] of [
      [otherAreaId, otherSideId, 'back-centre', 'Back centre', 2, null],
      [retiredAreaId, sideId, 'retired-area', 'Retired area', 3, new Date().toISOString()],
    ] as const) {
      await db().execute(sql`
        insert into embroidery_areas
          (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
           bound_height_px, display_order, retired_at)
        values (${id}, ${side}, ${code}, ${name}, 100, 150, 300, 200, ${order}, ${retired})
      `);
    }

    return { productId, sideId, areaId, otherSideId, otherAreaId, retiredSideId, retiredAreaId };
  }

  async function insertTemplate(
    overrides: {
      readonly status?: string;
      readonly currentVersion?: number;
      readonly productId?: string | null;
      readonly productSideId?: string | null;
      readonly embroideryAreaId?: string | null;
    } = {},
  ): Promise<string> {
    const id = newId();
    await db().execute(sql`
      INSERT INTO design_templates
        (id, name, slug, status, current_version, product_id, product_side_id, embroidery_area_id)
      VALUES (${id}, 'Fixture Template', ${`t-${id}`},
              ${overrides.status ?? 'DRAFT'}, ${overrides.currentVersion ?? 0},
              ${overrides.productId ?? null}, ${overrides.productSideId ?? null},
              ${overrides.embroideryAreaId ?? null})
    `);
    return id;
  }

  async function insertVersion(templateId: string, version = 1): Promise<void> {
    await db().execute(sql`
      INSERT INTO design_template_versions
        (id, design_template_id, version, design_document, document_schema_version)
      VALUES (${newId()}, ${templateId}, ${version}, ${'{}'}::jsonb, 1)
    `);
  }

  async function templateRow(id: string): Promise<Record<string, unknown>> {
    const rows = await db().execute(sql`
      SELECT status, current_version, product_id, product_side_id, embroidery_area_id
      FROM design_templates WHERE id = ${id}
    `);
    return (rows as unknown as { rows: Record<string, unknown>[] }).rows[0] ?? {};
  }

  async function countOf(table: string, templateId: string): Promise<number> {
    const rows = await db().execute(
      sql`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE design_template_id = ${templateId}`,
    );
    return Number((rows as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
  }

  async function auditCount(templateId: string): Promise<number> {
    const rows = await db().execute(sql`
      SELECT count(*)::int AS n FROM audit_events
      WHERE target_id = ${templateId} AND action = 'design_template.scope_assigned'
    `);
    return Number((rows as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
  }

  const body = () => ({
    productId: seeded.productId,
    productSideId: seeded.sideId,
    embroideryAreaId: seeded.areaId,
  });

  // -------------------------------------------------------------------------
  describe('the happy path', () => {
    it('assigns the triple to an unscoped zero-version DRAFT', async () => {
      const templateId = await insertTemplate();

      const response = await request(server()).put(route(templateId)).send(body()).expect(200);

      const data = envelopeData(response.body);
      expect(data.scope).toEqual(body());
      expect(data.status).toBe('DRAFT');
      // No version was created, so the detail carries none.
      expect(data.currentVersion).toBeUndefined();
      expect(data.document).toBeUndefined();

      expect(await templateRow(templateId)).toMatchObject({
        status: 'DRAFT',
        current_version: 0,
        product_id: seeded.productId,
        product_side_id: seeded.sideId,
        embroidery_area_id: seeded.areaId,
      });
    });

    it('creates no version, association or outbox event', async () => {
      const templateId = await insertTemplate();
      await request(server()).put(route(templateId)).send(body()).expect(200);

      expect(await countOf('design_template_versions', templateId)).toBe(0);
      expect(await countOf('design_template_assets', templateId)).toBe(0);

      const outbox = await db().execute(sql`
        SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = ${templateId}
      `);
      expect(Number((outbox as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0)).toBe(0);
    });

    it('writes exactly one Audit row naming the assigned triple', async () => {
      const templateId = await insertTemplate();
      await request(server()).put(route(templateId)).send(body()).expect(200);

      const rows = await db().execute(sql`
        SELECT action, target_kind, summary, admin_id, actor_kind FROM audit_events
        WHERE target_id = ${templateId}
      `);
      const audit = (rows as unknown as { rows: Record<string, unknown>[] }).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: 'design_template.scope_assigned',
        target_kind: 'DESIGN_TEMPLATE',
        actor_kind: 'ADMIN',
        admin_id: ADMIN_ID,
      });
      expect(audit[0]?.['summary']).toMatchObject({
        from: 'UNSCOPED',
        productId: seeded.productId,
        productSideId: seeded.sideId,
        embroideryAreaId: seeded.areaId,
      });
    });

    it('assigns against an unpublished Product', async () => {
      // The fixture Product is DRAFT. Publication readiness is APP3-B04's.
      const templateId = await insertTemplate();
      await request(server()).put(route(templateId)).send(body()).expect(200);
    });
  });

  // -------------------------------------------------------------------------
  describe('a scope that does not resolve', () => {
    const cases = (s: Seeded) =>
      [
        ['an Area from another Side', { ...bodyOf(s), embroideryAreaId: s.otherAreaId }],
        ['a Side from another Product', { ...bodyOf(s), productSideId: newId() }],
        ['a retired Side', { ...bodyOf(s), productSideId: s.retiredSideId }],
        ['a retired Area', { ...bodyOf(s), embroideryAreaId: s.retiredAreaId }],
        ['an unknown Product', { ...bodyOf(s), productId: newId() }],
      ] as const;

    function bodyOf(s: Seeded) {
      return { productId: s.productId, productSideId: s.sideId, embroideryAreaId: s.areaId };
    }

    it('refuses each, leaving every scope column null', async () => {
      for (const [label, payload] of cases(seeded)) {
        const templateId = await insertTemplate();

        await request(server()).put(route(templateId)).send(payload).expect(400);

        expect({ label, row: await templateRow(templateId) }).toEqual({
          label,
          row: {
            status: 'DRAFT',
            current_version: 0,
            product_id: null,
            product_side_id: null,
            embroidery_area_id: null,
          },
        });
        expect(await auditCount(templateId)).toBe(0);
      }
    });

    it('rejects a partial triple before any repository call', async () => {
      const templateId = await insertTemplate();

      await request(server())
        .put(route(templateId))
        .send({ productId: seeded.productId })
        .expect(400);

      expect(await templateRow(templateId)).toMatchObject({ product_id: null });
    });

    it('rejects an unknown field', async () => {
      const templateId = await insertTemplate();

      await request(server())
        .put(route(templateId))
        .send({ ...body(), expectedCurrentVersion: 0 })
        .expect(400);
    });

    it('answers 404 for a template that does not exist', async () => {
      await request(server()).put(route(newId())).send(body()).expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('a template that is no longer assignable', () => {
    it('refuses one that already has a scope, and does not overwrite it', async () => {
      const templateId = await insertTemplate({
        productId: seeded.productId,
        productSideId: seeded.otherSideId,
        embroideryAreaId: seeded.otherAreaId,
      });

      await request(server()).put(route(templateId)).send(body()).expect(409);

      // The original triple survives untouched — this is not a rescope.
      expect(await templateRow(templateId)).toMatchObject({
        product_side_id: seeded.otherSideId,
        embroidery_area_id: seeded.otherAreaId,
      });
      expect(await auditCount(templateId)).toBe(0);
    });

    it('fails closed on a partial legacy scope rather than repairing it', async () => {
      const templateId = await insertTemplate({ productId: seeded.productId });

      await request(server()).put(route(templateId)).send(body()).expect(409);

      expect(await templateRow(templateId)).toMatchObject({
        product_id: seeded.productId,
        product_side_id: null,
        embroidery_area_id: null,
      });
    });

    it('refuses one that already has a version', async () => {
      const templateId = await insertTemplate({ currentVersion: 1 });
      await insertVersion(templateId);

      await request(server()).put(route(templateId)).send(body()).expect(409);

      expect(await templateRow(templateId)).toMatchObject({ product_id: null });
    });

    it('refuses one whose version rows exist even at counter zero', async () => {
      // The counter and the rows agree in every state the code can produce, so
      // this is the divergence the `notExists` clause exists to fail closed on.
      const templateId = await insertTemplate({ currentVersion: 0 });
      await insertVersion(templateId, 1);

      await request(server()).put(route(templateId)).send(body()).expect(409);

      expect(await templateRow(templateId)).toMatchObject({ product_id: null });
    });

    for (const status of ['PUBLISHED', 'ARCHIVED'] as const) {
      it(`refuses a ${status} template`, async () => {
        const templateId = await insertTemplate({ status, currentVersion: 1 });
        await insertVersion(templateId);

        await request(server()).put(route(templateId)).send(body()).expect(409);

        expect(await templateRow(templateId)).toMatchObject({
          status,
          product_id: null,
        });
        expect(await auditCount(templateId)).toBe(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('concurrency', () => {
    it('lets exactly one of two different assignments win', async () => {
      const templateId = await insertTemplate();

      const [first, second] = await Promise.all([
        request(server()).put(route(templateId)).send({
          productId: seeded.productId,
          productSideId: seeded.sideId,
          embroideryAreaId: seeded.areaId,
        }),
        request(server()).put(route(templateId)).send({
          productId: seeded.productId,
          productSideId: seeded.otherSideId,
          embroideryAreaId: seeded.otherAreaId,
        }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      // One complete triple, and it is one of the two that were attempted —
      // never a mixture of both.
      const row = await templateRow(templateId);
      expect(row['product_id']).toBe(seeded.productId);
      const pairs = [
        [seeded.sideId, seeded.areaId],
        [seeded.otherSideId, seeded.otherAreaId],
      ].map(([side, area]) => `${String(side)}:${String(area)}`);
      expect(pairs).toContain(
        `${String(row['product_side_id'])}:${String(row['embroidery_area_id'])}`,
      );

      // Exactly one Audit row: the loser wrote nothing, so the scope and its
      // evidence rolled back together.
      expect(await auditCount(templateId)).toBe(1);
      expect(await countOf('design_template_versions', templateId)).toBe(0);
    });

    it('leaves the counter and status untouched through the race', async () => {
      const templateId = await insertTemplate();

      await Promise.all([
        request(server()).put(route(templateId)).send(body()),
        request(server()).put(route(templateId)).send(body()),
      ]);

      expect(await templateRow(templateId)).toMatchObject({
        status: 'DRAFT',
        current_version: 0,
      });
    });
  });
});
