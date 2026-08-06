/**
 * The Session authorization foundation against live PostgreSQL (`APP3-B06A`).
 *
 * The unit suite proves each decision in isolation; this proves the composed
 * Nest pipeline — guard order, real rows, real cookies, real headers, and the
 * CAS seam under genuine concurrent transactions.
 *
 * The controller here is **test-only** and deliberately so. `APP3-B06A` ships no
 * HTTP operation, and `APP3-B07`/`APP3-B06B` own the real ones; but a reusable
 * guard that has never been mounted on a route is not evidence of anything, so
 * the seam is exercised through a route that exists only in this file.
 */
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';

import { Controller, Get, HttpCode, Inject, Module, Param, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from '@embroidery/database';
import { createDisposableDatabase, type DisposableDatabase } from '@embroidery/database/testing';
import { DatabaseModule, TransactionManager } from '@embroidery/persistence';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { DesignModule } from '../../src/modules/design/design.module';
import { DesignSessionSecretVerifier } from '../../src/modules/design/infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionRateLimiter } from '../../src/modules/design/infrastructure/rate-limit/design-session-rate-limiter';
import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../../src/modules/design/domain/repositories/design-session.repository';
import { DesignSessionGuard } from '../../src/modules/design/presentation/guards/design-session.guard';
import {
  CurrentDesignSession,
  type DesignSessionContext,
} from '../../src/modules/design/presentation/design-session-context';
import { applyOfflineObjectStorageEnv } from '../../src/openapi/generation-environment';

const PEPPER = 'integration-pepper-value-0123456789abcdef';
const ORIGIN = 'https://studio.test';
const SECRET = 'S'.repeat(43);
const OTHER_SECRET = 'T'.repeat(43);

/** Test-only: the smallest route that proves the guard and the CAS seam. */
@Controller('design-sessions/:sessionId')
class SessionProbeController {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
  ) {}

  @Get('probe')
  @UseGuards(DesignSessionGuard)
  probe(@CurrentDesignSession() context: DesignSessionContext): DesignSessionContext {
    return context;
  }

  @Post('advance/:expected')
  @HttpCode(200)
  @UseGuards(DesignSessionGuard)
  async advance(
    @CurrentDesignSession() context: DesignSessionContext,
    @Param('expected') expected: string,
  ): Promise<{ revision: number }> {
    const session = await this.transactions.runInTransaction(() =>
      this.sessions.advanceRevision({
        id: context.designSessionId as DesignSessionId,
        expectedRevision: Number(expected),
        at: new Date(),
      }),
    );
    return { revision: session.autosaveRevision };
  }
}

@Module({
  imports: [DatabaseModule, DesignModule],
  controllers: [SessionProbeController],
})
class SessionProbeModule {}

describe('Design Session authorization (live PostgreSQL)', () => {
  let database: DisposableDatabase;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let verifier: DesignSessionSecretVerifier;
  let limiter: DesignSessionRateLimiter;
  let restoreStorage: () => void;
  const previous: Record<string, string | undefined> = {};

  beforeAll(async () => {
    database = await createDisposableDatabase('app3b06a-session-auth');
    for (const name of [
      'DATABASE_URL',
      'NODE_ENV',
      'DESIGN_SESSION_SECRET_PEPPER',
      'DESIGN_SESSION_ALLOWED_ORIGINS',
      'DESIGN_SESSION_COOKIE_SECURE',
    ]) {
      previous[name] = process.env[name];
    }
    process.env['DATABASE_URL'] = database.url;
    process.env['NODE_ENV'] = 'test';
    process.env['DESIGN_SESSION_SECRET_PEPPER'] = PEPPER;
    process.env['DESIGN_SESSION_ALLOWED_ORIGINS'] = ORIGIN;
    process.env['DESIGN_SESSION_COOKIE_SECURE'] = 'true';
    restoreStorage = applyOfflineObjectStorageEnv();

    const moduleRef = await Test.createTestingModule({ imports: [SessionProbeModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    http = request(app.getHttpServer() as Server);
    verifier = moduleRef.get(DesignSessionSecretVerifier);
    limiter = moduleRef.get(DesignSessionRateLimiter);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    restoreStorage?.();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await database?.drop();
  }, 300_000);

  beforeEach(() => limiter.reset());

  type Statement = Parameters<typeof database.client.db.execute>[0];

  /** One statement against the disposable database. */
  const exec = (statement: Statement) => database.client.db.execute(statement);

  /** The rows of one statement. */
  const rowsOf = async <T>(statement: Statement): Promise<T[]> =>
    (await exec(statement)).rows as T[];

  /**
   * The secret each seeded session was given.
   *
   * `session_secret_hash` is UNIQUE, so every session needs its own secret —
   * reusing one across two seeds is a constraint violation, not a shortcut.
   */
  const secrets = new Map<string, string>();

  /** A Product → Side → Area chain plus one session, inserted directly. */
  async function seedSession(
    options: { secret?: string; status?: string; expiresIn?: string } = {},
  ): Promise<string> {
    const secret = options.secret ?? randomBytes(32).toString('base64url');
    const ids = {
      asset: crypto.randomUUID(),
      category: crypto.randomUUID(),
      product: crypto.randomUUID(),
      side: crypto.randomUUID(),
      area: crypto.randomUUID(),
      session: crypto.randomUUID(),
    };
    // The placement chain a Session must point at, exactly as the accepted
    // design fixture builds it — a Side needs a background Asset, so the chain
    // starts there.
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
          values (${ids.side}, ${ids.product}, 'front', 'Front', ${ids.asset}, 1000, 1200, 400, 480, 2.5, 1)`);
    await exec(sql`insert into embroidery_areas
            (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
             bound_height_px, display_order)
          values (${ids.area}, ${ids.side}, 'chest', 'Chest', 100, 150, 300, 200, 1)`);
    await exec(sql`insert into design_sessions (id, session_secret_hash, product_id, product_side_id,
                                       embroidery_area_id, design_document, document_schema_version,
                                       autosave_revision, status, expires_at, last_activity_at)
          values (${ids.session}, ${verifier.digest(secret)}, ${ids.product},
                  ${ids.side}, ${ids.area}, '{}'::jsonb, 1, 0, ${options.status ?? 'ACTIVE'},
                  now() + cast(${options.expiresIn ?? '30 days'} as interval), now())`);
    secrets.set(ids.session, secret);
    return ids.session;
  }

  const cookieFor = (sessionId: string, secret = secrets.get(sessionId) ?? SECRET) =>
    `__Host-nettheu_ds_${sessionId}=${secret}`;

  const probe = (sessionId: string, cookie?: string) => {
    const call = http
      .get(`/design-sessions/${sessionId}/probe`)
      .set('Origin', ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  const revisionOf = async (sessionId: string): Promise<number> => {
    const rows = await rowsOf<{ autosave_revision: number }>(
      sql`select autosave_revision from design_sessions where id = ${sessionId}`,
    );
    return rows[0]?.autosave_revision ?? -1;
  };

  describe('the pair', () => {
    it('authorizes a valid id and its matching cookie', async () => {
      const id = await seedSession();
      const response = await probe(id, cookieFor(id)).expect(200);
      expect(response.body).toMatchObject({ designSessionId: id, currentRevision: 0 });
    });

    it('refuses the id alone', async () => {
      const id = await seedSession();
      await probe(id).expect(401);
    });

    it('refuses a foreign session cookie', async () => {
      const mine = await seedSession();
      const foreign = await seedSession();
      await probe(mine, cookieFor(foreign)).expect(401);
    });

    it('refuses a wrong secret indistinguishably from an unknown session', async () => {
      const id = await seedSession();
      const wrong = await probe(id, cookieFor(id, OTHER_SECRET)).expect(401);
      const unknown = await probe(crypto.randomUUID(), cookieFor(crypto.randomUUID())).expect(401);
      expect(wrong.body).toEqual(unknown.body);
    });

    it('refuses an expired session and clears the matching cookie', async () => {
      const id = await seedSession({ expiresIn: '-1 day' });
      const response = await probe(id, cookieFor(id)).expect(401);
      expect(String(response.headers['set-cookie'])).toContain(`__Host-nettheu_ds_${id}=`);
      expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    });

    it('refuses a terminal session and clears the matching cookie', async () => {
      const id = await seedSession({ status: 'EXPIRED' });
      const response = await probe(id, cookieFor(id)).expect(401);
      expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    });

    it('does not clear anything when the session id is simply unknown', async () => {
      const unknown = crypto.randomUUID();
      const response = await probe(unknown, cookieFor(unknown)).expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('never issues a cookie on success', async () => {
      const id = await seedSession();
      const response = await probe(id, cookieFor(id)).expect(200);
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('origin and fetch metadata', () => {
    it('refuses a missing Origin before reading any cookie', async () => {
      const id = await seedSession();
      await http
        .get(`/design-sessions/${id}/probe`)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', cookieFor(id))
        .expect(403);
    });

    it('refuses a cross-site fetch', async () => {
      const id = await seedSession();
      await http
        .get(`/design-sessions/${id}/probe`)
        .set('Origin', ORIGIN)
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Cookie', cookieFor(id))
        .expect(403);
    });

    it('refuses a foreign origin', async () => {
      const id = await seedSession();
      await http
        .get(`/design-sessions/${id}/probe`)
        .set('Origin', 'https://evil.test')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', cookieFor(id))
        .expect(403);
    });
  });

  describe('authorization is not a mutation', () => {
    it('leaves the session row untouched', async () => {
      const id = await seedSession();
      const before = await rowsOf<Record<string, unknown>>(
        sql`select autosave_revision, status, last_activity_at, updated_at from design_sessions where id = ${id}`,
      );
      await probe(id, cookieFor(id)).expect(200);
      await probe(id, cookieFor(id, OTHER_SECRET)).expect(401);
      const after = await rowsOf<Record<string, unknown>>(
        sql`select autosave_revision, status, last_activity_at, updated_at from design_sessions where id = ${id}`,
      );
      expect(after).toEqual(before);
    });

    it('writes no Audit or Outbox row', async () => {
      const id = await seedSession();
      await probe(id, cookieFor(id)).expect(200);
      await probe(id, cookieFor(id, OTHER_SECRET)).expect(401);
      const audit = await rowsOf<{ count: string }>(
        sql`select count(*)::text as count from audit_events`,
      );
      const outbox = await rowsOf<{ count: string }>(
        sql`select count(*)::text as count from outbox_events`,
      );
      expect(audit[0]?.count).toBe('0');
      expect(outbox[0]?.count).toBe('0');
    });

    it('stores no secret or digest outside the session row', async () => {
      const id = await seedSession();
      await probe(id, cookieFor(id)).expect(200);
      const digest = verifier.digest(SECRET);
      const hits = await rowsOf<{
        count: string;
      }>(sql`select count(*)::text as count from design_sessions
             where session_secret_hash = ${digest} and id <> ${id}`);
      expect(hits[0]?.count).toBe('0');
    });
  });

  describe('the revision seam', () => {
    it('advances exactly once on a matching expected revision', async () => {
      const id = await seedSession();
      await http
        .post(`/design-sessions/${id}/advance/0`)
        .set('Origin', ORIGIN)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', cookieFor(id))
        .expect(200);
      expect(await revisionOf(id)).toBe(1);
    });

    it('refuses a stale expected revision and mutates nothing', async () => {
      const id = await seedSession();
      const response = await http
        .post(`/design-sessions/${id}/advance/5`)
        .set('Origin', ORIGIN)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', cookieFor(id));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await revisionOf(id)).toBe(0);
    });

    it('has exactly one winner when two callers present the same revision', async () => {
      const id = await seedSession();
      const attempt = () =>
        http
          .post(`/design-sessions/${id}/advance/0`)
          .set('Origin', ORIGIN)
          .set('Sec-Fetch-Site', 'same-origin')
          .set('Cookie', cookieFor(id));

      const results = await Promise.all([attempt(), attempt(), attempt()]);
      const winners = results.filter((response) => response.status === 200);
      expect(winners).toHaveLength(1);
      expect(await revisionOf(id)).toBe(1);
    });
  });

  describe('rate limiting', () => {
    it('refuses once the authorization-failure budget is spent', async () => {
      const id = await seedSession();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await probe(id, cookieFor(id, OTHER_SECRET)).expect(401);
      }
      await probe(id, cookieFor(id, OTHER_SECRET)).expect(429);
    });

    it('does not spend the failure budget on a successful request', async () => {
      const id = await seedSession();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await probe(id, cookieFor(id)).expect(200);
      }
      await probe(id, cookieFor(id, OTHER_SECRET)).expect(401);
    });
  });
});
