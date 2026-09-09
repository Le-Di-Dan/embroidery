/**
 * `APP12-M01.E1` §7 — the application/domain half of the media invariants.
 *
 * The database half (four constraints, positions, roles) is `APP12-M01.DB1`'s
 * integration suite and is run as itself; re-implementing it here would be a
 * second copy of the same DDL assertions against the same server.
 *
 * What this file proves is the half no constraint can: that the **application**
 * composes a legal write in the first place. Twenty accepted, twenty-one
 * refused whole, a repeated Asset refused, positions written contiguous from
 * zero, and exactly one primary — asserted against the rows the service wrote,
 * read straight out of this run's disposable database rather than back through
 * the projection that produced them.
 *
 * Driven over real HTTP against the real API, with a real Admin session, because
 * the Admin screen cannot compose any of the refusals: no control offers a
 * twenty-first image and none offers the same image twice.
 */
import { expect, test, type APIResponse, type Page } from '@playwright/test';

import {
  adminOrigin,
  databaseUrl,
  E1,
  operatorSession,
  readStoredMedia,
} from './support/m01e1-world';

test.describe.configure({ mode: 'serial' });

const MAX_PRODUCT_MEDIA_ITEMS = 20;

const DOMAIN_PRODUCT = E1.domainId;
const POOL = E1.domainPool;

interface Envelope {
  readonly success: boolean;
  readonly code: string;
  readonly data?: { readonly updatedAt: string; readonly media?: unknown[] };
}

async function envelope(response: APIResponse): Promise<Envelope> {
  return (await response.json()) as Envelope;
}

/** The product as the Admin API reports it, which is where `expectedUpdatedAt` comes from. */
async function readProduct(page: Page): Promise<Envelope> {
  const response = await page.request.get(`/api/admin/products/${DOMAIN_PRODUCT()}`);
  expect(response.status(), 'the Admin product read must succeed').toBe(200);
  return envelope(response);
}

/**
 * One media replacement, through the real operation.
 *
 * `Origin` is stated explicitly: `StaffOriginGuard` refuses a staff mutation
 * whose origin is outside the Admin allowlist, and an `APIRequestContext` sends
 * no origin of its own. The session travels in the browser context's cookies,
 * which `page.request` shares — nothing is injected and no guard is bypassed.
 */
async function replaceMedia(page: Page, mediaAssetIds: string[]): Promise<APIResponse> {
  const { data } = await readProduct(page);
  return page.request.put(`/api/admin/products/${DOMAIN_PRODUCT()}/media`, {
    headers: { 'content-type': 'application/json', origin: adminOrigin() },
    data: { expectedUpdatedAt: data?.updatedAt, mediaAssetIds },
  });
}

const operator = operatorSession();

test('twenty images are accepted, and written contiguous from zero with one primary', async () => {
  const page = operator.page();
  const twenty = POOL().slice(0, MAX_PRODUCT_MEDIA_ITEMS);
  expect(twenty, 'the fixture pool must hold twenty distinct Assets').toHaveLength(20);

  const response = await replaceMedia(page, twenty);
  expect(response.status(), await response.text()).toBe(200);

  // Read the rows the service wrote, not the payload it returned. The payload is
  // the same projection under test; the rows are the thing the next reader sees.
  const stored = await readStoredMedia(DOMAIN_PRODUCT());
  expect(stored.map((row) => row.assetId)).toEqual(twenty);
  expect(
    stored.map((row) => row.displayOrder),
    'positions are contiguous 0..N-1, with no gap and no repeat',
  ).toEqual([...twenty.keys()]);
  expect(
    stored.filter((row) => row.role === 'THUMBNAIL').map((row) => row.displayOrder),
    'exactly one THUMBNAIL, and it is at position 0',
  ).toEqual([0]);
  expect(stored.slice(1).every((row) => row.role !== 'THUMBNAIL')).toBe(true);
});

test('a twenty-first image is refused, and the accepted twenty are untouched', async () => {
  const page = operator.page();
  const before = await readStoredMedia(DOMAIN_PRODUCT());
  expect(before, 'the previous journey left twenty images to protect').toHaveLength(20);

  const twentyOne = POOL().slice(0, MAX_PRODUCT_MEDIA_ITEMS + 1);
  expect(twentyOne).toHaveLength(21);
  const response = await replaceMedia(page, twentyOne);

  // A refusal, and a client-error one. The cap is stated twice on purpose —
  // `mediaAssetIds` carries `.max(MAX_PRODUCT_MEDIA_ITEMS)` in the request
  // schema and `PRODUCT_MEDIA_TOO_MANY` behind it — so the request is stopped by
  // whichever runs first. Both are 400 and both are whole; the assertion is on
  // the refusal and on what survived it, not on which layer spoke.
  expect(response.status(), await response.text()).toBe(400);
  const body = await envelope(response);
  expect(body.success).toBe(false);
  process.stdout.write(`[m01e1] twenty-first image refused as ${body.code}\n`);

  // Atomic: nothing was written, not even the first twenty of the twenty-one.
  expect(await readStoredMedia(DOMAIN_PRODUCT())).toEqual(before);
});

test('a repeated Asset is refused, and the stored selection is untouched', async () => {
  const page = operator.page();
  const before = await readStoredMedia(DOMAIN_PRODUCT());
  const pool = POOL();
  // Three ids, the first repeated. Short deliberately: a duplicate inside a
  // full-cap request would also trip the count bound, and the refusal under test
  // has to be the duplicate one.
  const withRepeat = [pool[0] as string, pool[1] as string, pool[0] as string];

  const response = await replaceMedia(page, withRepeat);
  expect(response.status(), await response.text()).toBe(400);
  expect((await envelope(response)).code).toBe('PRODUCT_MEDIA_DUPLICATE');

  // The refusal did not collapse the duplicate and write two images either.
  expect(await readStoredMedia(DOMAIN_PRODUCT())).toEqual(before);
});

test('an unknown Asset is refused, and a shorter legal selection then persists', async () => {
  const page = operator.page();
  const before = await readStoredMedia(DOMAIN_PRODUCT());
  const pool = POOL();
  // A well-formed UUID that addresses nothing, so the refusal is about existence
  // rather than about shape.
  const unknown = '00000000-0000-4000-8000-000000000000';

  const refused = await replaceMedia(page, [pool[0] as string, unknown]);
  expect(refused.status(), await refused.text()).toBe(400);
  expect((await envelope(refused)).code).toBe('PRODUCT_MEDIA_ASSET_NOT_FOUND');
  expect(await readStoredMedia(DOMAIN_PRODUCT())).toEqual(before);

  // And the same route still accepts a legal selection immediately afterwards,
  // so the refusals above left no lock, no partial row and no poisoned state.
  const three = pool.slice(0, 3);
  const accepted = await replaceMedia(page, three);
  expect(accepted.status(), await accepted.text()).toBe(200);
  const stored = await readStoredMedia(DOMAIN_PRODUCT());
  expect(stored.map((row) => row.assetId)).toEqual(three);
  expect(stored.map((row) => row.displayOrder)).toEqual([0, 1, 2]);
  expect(stored.filter((row) => row.role === 'THUMBNAIL')).toHaveLength(1);
});

test('an empty selection is legal on a DRAFT, and the fixture guard is real', async () => {
  const page = operator.page();
  // §4's DRAFT rule: a draft may hold no images at all. The state the Admin
  // empty frame draws, reached through the operation rather than by deleting
  // rows.
  const response = await replaceMedia(page, []);
  expect(response.status(), await response.text()).toBe(200);
  expect(await readStoredMedia(DOMAIN_PRODUCT())).toHaveLength(0);

  // The guard that keeps every one of these writes off a shared database is not
  // taken on trust: the disposable name is what the fixture module checks, and
  // this run's URL has to satisfy it.
  expect(
    new URL(databaseUrl()).pathname.replace(/^\//, ''),
    'every write in this suite landed in a disposable database',
  ).toMatch(/^embroidery_db7_/);
});
