/**
 * `APP11-B02` over HTTP — ordered gallery media, publish and unpublish.
 *
 * The whole stack runs against a disposable PostgreSQL: the Admin session
 * guard, the Origin allowlist, the JSON-only guard, the Zod pipe, the response
 * envelope and the exception filter. Asserted here and nowhere else is what no
 * schema check can see — that a replacement really replaces, that an invalid
 * selection leaves the previous one intact, that readiness is recomputed from
 * the stored row rather than from anything the client sent, that unpublish
 * keeps every image and every authoring field, and that a stale token writes
 * nothing.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  galleryAssetsUrl as assetsUrl,
  galleryFixture,
  galleryPublicationUrl as publicationUrl,
  loginAsOperator,
  seedGalleryAsset,
  GALLERY_FIXTURE_EMAIL,
  GALLERY_FIXTURE_PASSWORD,
  type Envelope,
  type GalleryEntryPayload as EntryPayload,
} from '../support/gallery-lifecycle-fixture';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const FOREIGN_ORIGIN = 'http://evil.example.test';

describe('Admin gallery media & publication HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;
  let fixture: ReturnType<typeof galleryFixture>;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app11b02-gallery-lifecycle');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: GALLERY_FIXTURE_EMAIL,
      password: GALLERY_FIXTURE_PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    cookie = await loginAsOperator(ctx.http, ADMIN_ORIGIN);
    fixture = galleryFixture(ctx, cookie, ADMIN_ORIGIN);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 240_000);

  // Bound lazily: `fixture` is only built once the application is up.
  const authed = {
    get: (path: string) => fixture.authed.get(path),
    post: (path: string) => fixture.authed.post(path),
    put: (path: string) => fixture.authed.put(path),
    delete: (path: string) => fixture.authed.delete(path),
  };
  const createEntry = (o?: Record<string, unknown>) => fixture.createEntry(o);
  const read = (id: string) => fixture.read(id);
  const attach = (e: EntryPayload, ids: readonly string[]) => fixture.attach(e, ids);
  const readyEntry = (o?: Record<string, unknown>) => fixture.readyEntry(o);
  const publish = (e: EntryPayload) => fixture.publish(e);
  const seedPublicPair = () => fixture.seedPublicPair();
  const seedPublicTriple = () => fixture.seedPublicTriple();
  const seedAsset = (
    classification: 'PUBLIC' | 'CUSTOMER_PRIVATE' | 'PRODUCTION_SENSITIVE',
    status?: 'ACCEPTED' | 'DELETED',
  ) => seedGalleryAsset(ctx, classification, status);

  describe('ordered asset replacement', () => {
    it('stores the request order, with position 0 as the cover', async () => {
      const entry = await createEntry();
      const [first, second, third] = await seedPublicTriple();

      const updated = await attach(entry, [first, second, third]);

      expect(updated.assets).toEqual([
        { assetId: first, position: 0 },
        { assetId: second, position: 1 },
        { assetId: third, position: 2 },
      ]);
      expect(updated.coverAssetId).toBe(first);
      expect(updated.assetCount).toBe(3);
      // …and the detail read agrees with the write's own answer.
      expect((await read(entry.galleryEntryId)).assets).toEqual(updated.assets);
    });

    it('replaces rather than appends, and re-orders in place', async () => {
      const entry = await createEntry();
      const [a, b, c] = await seedPublicTriple();
      const withTwo = await attach(entry, [a, b]);

      // A completely different selection, one member of which was already
      // attached — an append would leave three, and a diff would leave `a` at
      // its old position.
      const replaced = await attach(withTwo, [c, a]);

      expect(replaced.assets).toEqual([
        { assetId: c, position: 0 },
        { assetId: a, position: 1 },
      ]);
      expect(replaced.coverAssetId).toBe(c);
    });

    it('clears the whole selection with an empty array', async () => {
      const entry = await attach(await createEntry(), [await seedAsset('PUBLIC')]);

      const cleared = await attach(entry, []);

      expect(cleared.assets).toEqual([]);
      expect(cleared.assetCount).toBe(0);
      expect(cleared.coverAssetId).toBeUndefined();
      expect(cleared.status).toBe('DRAFT');
    });

    it('advances the concurrency token on every successful replacement', async () => {
      const entry = await createEntry();

      const updated = await attach(entry, [await seedAsset('PUBLIC')]);

      expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(entry.updatedAt));
    });

    it('refuses a duplicate image rather than silently collapsing it', async () => {
      const entry = await createEntry();
      const assetId = await seedAsset('PUBLIC');

      const res = await authed
        .put(assetsUrl(entry.galleryEntryId))
        .send({ assetIds: [assetId, assetId], expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, code: 'GALLERY_ENTRY_ASSET_DUPLICATE' });
      expect((await read(entry.galleryEntryId)).assets).toEqual([]);
    });

    it.each([
      ['an unknown asset', () => Promise.resolve(newId())],
      ['a customer-private asset', () => seedAsset('CUSTOMER_PRIVATE')],
      ['a production-sensitive asset', () => seedAsset('PRODUCTION_SENSITIVE')],
      ['a tombstoned public asset', () => seedAsset('PUBLIC', 'DELETED')],
    ])('refuses %s, and changes nothing', async (_label, seed) => {
      // The entry already holds a good selection, so a partial mutation would
      // be visible as a lost or half-written one.
      const keeper = await seedAsset('PUBLIC');
      const entry = await attach(await createEntry(), [keeper]);

      const res = await authed
        .put(assetsUrl(entry.galleryEntryId))
        .send({ assetIds: [await seed()], expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(400);
      // One code for every case: telling "no such asset" from "not a public
      // image" apart is how an endpoint confirms private artwork exists.
      expect(res.body).toMatchObject({
        success: false,
        code: 'GALLERY_ENTRY_ASSET_NOT_ELIGIBLE',
      });
      const after = await read(entry.galleryEntryId);
      expect(after.assets).toEqual([{ assetId: keeper, position: 0 }]);
      expect(after.updatedAt).toBe(entry.updatedAt);
    });

    it('refuses a stale token and writes nothing', async () => {
      const keeper = await seedAsset('PUBLIC');
      const entry = await attach(await createEntry(), [keeper]);
      // A concurrent edit moves the token on.
      const moved = await attach(entry, [keeper]);

      const res = await authed
        .put(assetsUrl(entry.galleryEntryId))
        .send({ assetIds: [], expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ success: false, code: 'GALLERY_ENTRY_VERSION_CONFLICT' });
      const after = await read(entry.galleryEntryId);
      expect(after.assets).toEqual([{ assetId: keeper, position: 0 }]);
      expect(after.updatedAt).toBe(moved.updatedAt);
    });

    it('is a 404 for an entry that does not exist', async () => {
      const res = await authed
        .put(assetsUrl(newId()))
        .send({ assetIds: [], expectedUpdatedAt: new Date().toISOString() });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, code: 'GALLERY_ENTRY_NOT_FOUND' });
    });

    it('publishes no storage fact in a success or a refusal', async () => {
      const entry = await attach(await createEntry(), [await seedAsset('PUBLIC')]);
      const refusal = await authed
        .put(assetsUrl(entry.galleryEntryId))
        .send({ assetIds: [newId()], expectedUpdatedAt: entry.updatedAt });

      for (const body of [JSON.stringify(entry), JSON.stringify(refusal.body)]) {
        expect(body).not.toMatch(/storageKey|storage_key|bucket|checksum|altText|mimeType/i);
        expect(body).not.toMatch(/gallery_entry_assets|constraint|relation/i);
      }
    });
  });

  describe('publish', () => {
    it('moves a ready DRAFT to PUBLISHED and advances the token', async () => {
      const entry = await readyEntry();

      const res = await authed
        .post(publicationUrl(entry.galleryEntryId))
        .send({ expectedUpdatedAt: entry.updatedAt });

      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_PUBLISHED' });
      const published = (res.body as Envelope<EntryPayload>).data;
      expect(published.status).toBe('PUBLISHED');
      expect(published.archivedAt).toBeUndefined();
      expect(Date.parse(published.updatedAt)).toBeGreaterThan(Date.parse(entry.updatedAt));
      expect((await read(entry.galleryEntryId)).status).toBe('PUBLISHED');
    });

    it('publishes a noindex entry with no linked product and no SEO text', async () => {
      const entry = await readyEntry({ isIndexable: false });

      const published = await publish(entry);

      expect(published.status).toBe('PUBLISHED');
      expect(published.isIndexable).toBe(false);
      expect(published.linkedProductId).toBeUndefined();
      expect(published.seoTitle).toBeUndefined();
      expect(published.seoDescription).toBeUndefined();
    });

    it('refuses an entry with no eligible image, naming the requirement', async () => {
      const entry = await createEntry();

      const res = await authed
        .post(publicationUrl(entry.galleryEntryId))
        .send({ expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        success: false,
        code: 'GALLERY_ENTRY_PUBLICATION_NOT_READY',
        errors: [{ field: 'requirements', code: 'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED' }],
      });
      expect((await read(entry.galleryEntryId)).status).toBe('DRAFT');
    });

    it('re-evaluates eligibility, not merely attachment', async () => {
      // The image was eligible when it was attached and is tombstoned
      // afterwards. A readiness check that counted associations would publish
      // an entry whose only image can no longer be served.
      const assetId = await seedAsset('PUBLIC');
      const entry = await attach(await createEntry(), [assetId]);
      await ctx.database.client.db.execute(
        sql`update assets set status = 'DELETED', deleted_at = now() where id = ${assetId}`,
      );

      const res = await authed
        .post(publicationUrl(entry.galleryEntryId))
        .send({ expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_PUBLICATION_NOT_READY' });
      // The association itself is untouched — readiness refuses, it does not
      // repair.
      expect((await read(entry.galleryEntryId)).assets).toEqual([{ assetId, position: 0 }]);
    });

    it.each([
      ['title', 'title'],
      ['description', 'description'],
    ])('refuses an entry whose stored %s is blank', async (_label, column) => {
      // Unreachable through the DTO, which trims and requires a title, and set
      // here directly for exactly that reason: readiness must read persisted
      // state, not the body of the request that is asking.
      const entry = await readyEntry();
      await ctx.database.client.db.execute(
        sql`update gallery_entries set ${sql.raw(column)} = '   ' where id = ${entry.galleryEntryId}`,
      );
      const current = await read(entry.galleryEntryId);

      const res = await authed
        .post(publicationUrl(entry.galleryEntryId))
        .send({ expectedUpdatedAt: current.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_PUBLICATION_NOT_READY' });
      expect(JSON.stringify(res.body)).toMatch(
        column === 'title' ? 'GALLERY_ENTRY_TITLE_REQUIRED' : 'GALLERY_ENTRY_DESCRIPTION_REQUIRED',
      );
    });

    it('refuses a state that cannot be published', async () => {
      const published = await publish(await readyEntry());

      const again = await authed
        .post(publicationUrl(published.galleryEntryId))
        .send({ expectedUpdatedAt: published.updatedAt });

      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ code: 'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED' });

      // Archived is refused the same way, and `APP11-B02` provides no route to
      // reach that state — hence the direct write.
      const archived = await readyEntry();
      await ctx.database.client.db.execute(
        sql`update gallery_entries set status = 'ARCHIVED', archived_at = now()
            where id = ${archived.galleryEntryId}`,
      );
      const current = await read(archived.galleryEntryId);
      const res = await authed
        .post(publicationUrl(archived.galleryEntryId))
        .send({ expectedUpdatedAt: current.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED' });
      expect((await read(archived.galleryEntryId)).status).toBe('ARCHIVED');
    });

    it('refuses a stale token and does not publish', async () => {
      const entry = await readyEntry();
      const moved = await attach(entry, [await seedAsset('PUBLIC')]);

      const res = await authed
        .post(publicationUrl(entry.galleryEntryId))
        .send({ expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_VERSION_CONFLICT' });
      const after = await read(entry.galleryEntryId);
      expect(after.status).toBe('DRAFT');
      expect(after.updatedAt).toBe(moved.updatedAt);
    });
  });

  describe('unpublish', () => {
    it('returns a PUBLISHED entry to DRAFT, keeping everything else', async () => {
      const [a, b] = await seedPublicPair();
      const draft = await createEntry({ seoTitle: 'SEO', seoDescription: 'Mô tả SEO' });
      const published = await publish(await attach(draft, [a, b]));

      const res = await authed
        .delete(publicationUrl(published.galleryEntryId))
        .send({ expectedUpdatedAt: published.updatedAt });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_UNPUBLISHED' });
      const back = (res.body as Envelope<EntryPayload>).data;
      expect(back.status).toBe('DRAFT');
      // Not archive: the evidence column is never written.
      expect(back.archivedAt).toBeUndefined();
      // Not delete: the entry, its ordered images and every authoring field
      // survive exactly as they were.
      expect(back.assets).toEqual([
        { assetId: a, position: 0 },
        { assetId: b, position: 1 },
      ]);
      expect(back.coverAssetId).toBe(a);
      expect(back.title).toBe(draft.title);
      expect(back.slug).toBe(draft.slug);
      expect(back.description).toBe(draft.description);
      expect(back.seoTitle).toBe('SEO');
      expect(back.seoDescription).toBe('Mô tả SEO');
      expect(back.displayOrder).toBe(draft.displayOrder);
      expect(back.isIndexable).toBe(true);
      expect(Date.parse(back.updatedAt)).toBeGreaterThan(Date.parse(published.updatedAt));
      expect(await read(published.galleryEntryId)).toEqual(back);
    });

    it('leaves a still-publishable draft behind', async () => {
      const published = await publish(await readyEntry());

      const res = await authed
        .delete(publicationUrl(published.galleryEntryId))
        .send({ expectedUpdatedAt: published.updatedAt });

      expect(res.status).toBe(200);
      // Publishing the same entry again succeeds, so unpublish left an
      // editable, still-ready draft rather than a half-dismantled one.
      expect((await publish((res.body as Envelope<EntryPayload>).data)).status).toBe('PUBLISHED');
    });

    it('refuses a state that cannot be unpublished', async () => {
      const entry = await readyEntry();

      const res = await authed
        .delete(publicationUrl(entry.galleryEntryId))
        .send({ expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED' });
      expect((await read(entry.galleryEntryId)).status).toBe('DRAFT');
    });

    it('refuses a stale token and stays published', async () => {
      const published = await publish(await readyEntry());
      const moved = await attach(published, [await seedAsset('PUBLIC')]);

      const res = await authed
        .delete(publicationUrl(published.galleryEntryId))
        .send({ expectedUpdatedAt: published.updatedAt });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GALLERY_ENTRY_VERSION_CONFLICT' });
      const after = await read(published.galleryEntryId);
      expect(after.status).toBe('PUBLISHED');
      expect(after.updatedAt).toBe(moved.updatedAt);
    });
  });

  describe('authorization and write guards', () => {
    it('rejects all three operations without a live Admin session', async () => {
      const entry = await readyEntry();
      const id = entry.galleryEntryId;
      const token = { expectedUpdatedAt: entry.updatedAt };

      const anonymous = await Promise.all([
        ctx.http
          .put(assetsUrl(id))
          .set('Origin', ADMIN_ORIGIN)
          .send({ assetIds: [], ...token }),
        ctx.http.post(publicationUrl(id)).set('Origin', ADMIN_ORIGIN).send(token),
        ctx.http.delete(publicationUrl(id)).set('Origin', ADMIN_ORIGIN).send(token),
      ]);

      for (const res of anonymous) {
        expect(res.status).toBe(401);
      }
      // …and none of the three writes happened.
      const after = await read(id);
      expect(after.status).toBe('DRAFT');
      expect(after.assets).toEqual(entry.assets);
      expect(after.updatedAt).toBe(entry.updatedAt);
    });

    it('rejects an origin outside the Admin allowlist', async () => {
      const entry = await readyEntry();

      const res = await ctx.http
        .post(publicationUrl(entry.galleryEntryId))
        .set('Cookie', cookie)
        .set('Origin', FOREIGN_ORIGIN)
        .send({ expectedUpdatedAt: entry.updatedAt });

      expect(res.status).toBe(403);
      expect((await read(entry.galleryEntryId)).status).toBe('DRAFT');
    });

    it('rejects a body that is not application/json', async () => {
      const entry = await readyEntry();

      const res = await ctx.http
        .post(publicationUrl(entry.galleryEntryId))
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send(`{"expectedUpdatedAt":"${entry.updatedAt}"}`);

      expect(res.status).toBe(415);
      expect((await read(entry.galleryEntryId)).status).toBe('DRAFT');
    });

    it('refuses a command that carries no concurrency token', async () => {
      const entry = await readyEntry();

      const res = await authed.post(publicationUrl(entry.galleryEntryId)).send({});

      expect(res.status).toBe(400);
      expect((await read(entry.galleryEntryId)).status).toBe('DRAFT');
    });
  });
});
