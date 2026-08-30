/**
 * Live-database fixtures for the `APP11-B02` gallery media and publication
 * suite.
 *
 * Gallery entries are built through the **real** delivered API — a fixture can
 * never create an entry the Admin surface could not — and every helper returns
 * the entry as the API just published it, so a caller always holds the current
 * concurrency token without a second read.
 *
 * Assets are seeded with explicit SQL. That is deliberate: this suite is about
 * what the Gallery boundary *refuses*, and the customer-private and
 * production-sensitive lanes are exactly the rows no Gallery code path can
 * create.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import type { ApiIntegrationTestContext, ApiTestAgent } from './api-integration-context';

/** Synthetic, non-secret operator credentials for the suite's Admin session. */
export const GALLERY_FIXTURE_EMAIL = 'gallery-lifecycle@example.test';
export const GALLERY_FIXTURE_PASSWORD = 'operator-secret-123';

export const GALLERY_ENTRIES_PATH = '/api/admin/gallery-entries';

export const galleryAssetsUrl = (id: string) => `${GALLERY_ENTRIES_PATH}/${id}/assets`;
export const galleryPublicationUrl = (id: string) => `${GALLERY_ENTRIES_PATH}/${id}/publication`;

export interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
}

/** The Admin gallery detail payload, exactly as `APP11-B01` publishes it. */
export interface GalleryEntryPayload {
  readonly galleryEntryId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly displayOrder: number;
  readonly linkedProductId?: string;
  readonly isIndexable: boolean;
  readonly coverAssetId?: string;
  readonly assetCount: number;
  readonly description: string;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assets: readonly { assetId: string; position: number }[];
}

export type AssetClassification = 'PUBLIC' | 'CUSTOMER_PRIVATE' | 'PRODUCTION_SENSITIVE';

/** Signs the operator in and returns the `adm_session` cookie pair. */
export async function loginAsOperator(
  http: ApiTestAgent,
  origin: string,
  email: string = GALLERY_FIXTURE_EMAIL,
  password: string = GALLERY_FIXTURE_PASSWORD,
): Promise<string> {
  const res = await http.post('/api/staff/session').set('Origin', origin).send({ email, password });
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const session = cookies.find((value) => value.startsWith('adm_session='));
  if (session === undefined) {
    throw new Error('login set no adm_session cookie');
  }
  return session.split(';')[0] as string;
}

/**
 * Seeds one asset row in whatever lane the case needs.
 *
 * A `PUBLIC` asset is `GALLERY_MEDIA`; anything else is a customer upload,
 * which is the shape of the rows the gallery must refuse.
 */
export async function seedGalleryAsset(
  ctx: ApiIntegrationTestContext,
  classification: AssetClassification = 'PUBLIC',
  status: 'ACCEPTED' | 'DELETED' = 'ACCEPTED',
): Promise<string> {
  const id = newId();
  const kind = classification === 'PUBLIC' ? 'GALLERY_MEDIA' : 'CUSTOMER_UPLOAD';
  await ctx.database.client.db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values (${id}, ${kind}, ${classification}, ${`gallery/${id}.png`}, 'image/png', 512, ${status})
  `);
  return id;
}

/**
 * The authenticated Admin client and the entry helpers built on it.
 *
 * Every mutating helper asserts its own success and returns the fresh payload,
 * so a test reads as the sequence of operator actions it describes rather than
 * as envelope unwrapping.
 */
export function galleryFixture(ctx: ApiIntegrationTestContext, cookie: string, origin: string) {
  const authed = {
    get: (path: string) => ctx.http.get(path).set('Cookie', cookie),
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', origin),
    put: (path: string) => ctx.http.put(path).set('Cookie', cookie).set('Origin', origin),
    delete: (path: string) => ctx.http.delete(path).set('Cookie', cookie).set('Origin', origin),
  };

  let slugCounter = 0;

  async function createEntry(
    overrides: Record<string, unknown> = {},
  ): Promise<GalleryEntryPayload> {
    slugCounter += 1;
    // A UUIDv7 prefix is a timestamp, so ids minted in one run share their
    // leading characters; the counter makes the public address unique by
    // construction rather than by luck.
    const unique = `${newId().replaceAll('-', '').slice(-8)}${slugCounter}`;
    const res = await authed.post(GALLERY_ENTRIES_PATH).send({
      title: 'Áo thêu hoa sen',
      slug: `bo-suu-tap-${unique}`,
      description: 'Thêu tay trên vải lanh.',
      displayOrder: 100,
      isIndexable: true,
      ...overrides,
    });
    expect(res.status).toBe(201);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  async function read(id: string): Promise<GalleryEntryPayload> {
    const res = await authed.get(`${GALLERY_ENTRIES_PATH}/${id}`);
    expect(res.status).toBe(200);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  /** Stores the selection and returns the entry as it now stands. */
  async function attach(
    entry: GalleryEntryPayload,
    assetIds: readonly string[],
  ): Promise<GalleryEntryPayload> {
    const res = await authed
      .put(galleryAssetsUrl(entry.galleryEntryId))
      .send({ assetIds, expectedUpdatedAt: entry.updatedAt });
    expect(res.status).toBe(200);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  async function publish(entry: GalleryEntryPayload): Promise<GalleryEntryPayload> {
    const res = await authed
      .post(galleryPublicationUrl(entry.galleryEntryId))
      .send({ expectedUpdatedAt: entry.updatedAt });
    expect(res.status).toBe(200);
    return (res.body as Envelope<GalleryEntryPayload>).data;
  }

  // Distinct eligible gallery images, as fixed-length tuples so a caller can
  // destructure them without an index whose type is `string | undefined`.
  const seedPublicPair = () => Promise.all([seedGalleryAsset(ctx), seedGalleryAsset(ctx)] as const);
  const seedPublicTriple = () =>
    Promise.all([seedGalleryAsset(ctx), seedGalleryAsset(ctx), seedGalleryAsset(ctx)] as const);

  /** A DRAFT that satisfies every publication requirement. */
  async function readyEntry(overrides: Record<string, unknown> = {}): Promise<GalleryEntryPayload> {
    return attach(await createEntry(overrides), [await seedGalleryAsset(ctx)]);
  }

  return {
    authed,
    createEntry,
    read,
    attach,
    publish,
    readyEntry,
    seedPublicPair,
    seedPublicTriple,
  };
}
