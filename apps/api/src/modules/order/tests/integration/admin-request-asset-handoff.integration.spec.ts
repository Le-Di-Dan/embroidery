/**
 * `APP5-B04` → `APP5-B06` — the handoff `APP5-A02` will make (§16, §17).
 *
 * One proof, and deliberately only one. B04's own suite already covers the
 * detail read; what is unproven until here is that the `assetId` that read
 * publishes is *usable* at the delivery address with nothing else — no bucket,
 * no object key, no customer challenge, no signed URL and no prepare-download
 * step. If that is true, A02 needs only the two ids it already renders.
 *
 * The two modules are booted together because the claim spans them. Everything
 * else about B04 is left alone: this asserts nothing about its queue, its
 * filters, its masking or its history, and reruns none of it.
 */
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import {
  binaryParser,
  contentRoute,
  createAdminRequestAssetContext,
  JPEG_BYTES,
  type AdminRequestAssetTestContext,
} from './admin-request-asset-context';

interface DetailBody {
  readonly requestId: string;
  readonly assets: readonly {
    readonly assetId: string;
    readonly role: string;
    readonly mimeType?: string;
    readonly sizeBytes?: string;
  }[];
}

describe('APP5-B06 — the B04 detail hands an operator a readable attachment', () => {
  let context: AdminRequestAssetTestContext;

  beforeAll(async () => {
    context = await createAdminRequestAssetContext('app5-b06-handoff', {
      withAdminReadModel: true,
    });
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  it('takes requestId + assetId from the detail response and streams the bytes', async () => {
    await context.reset();
    const cookie = await context.seedAdminSession();
    const customerId = await context.seedCustomer();
    const requestId = await context.seedRequest(customerId);
    const seeded = await context.seedAsset(customerId, {
      bytes: JPEG_BYTES,
      mimeType: 'image/jpeg',
    });
    await context.bindAsset(requestId, seeded.assetId, 'COP_IMAGE');

    const detail = await request(context.server())
      .get(`/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);

    const body = (detail.body as { data: DetailBody }).data;
    const attachment = body.assets[0];
    // The detail still publishes no storage identity — the two ids and the
    // metadata are the whole of what A02 will have.
    expect(JSON.stringify(detail.body)).not.toContain(seeded.storageKey);
    expect(attachment?.role).toBe('COP_IMAGE');
    expect(attachment?.mimeType).toBe('image/jpeg');

    const content = await request(context.server())
      .get(contentRoute(body.requestId, attachment?.assetId ?? ''))
      .set('Cookie', cookie)
      .buffer()
      .parse(binaryParser);

    expect(content.status).toBe(200);
    expect(content.body).toEqual(JPEG_BYTES);
    expect(content.headers['content-length']).toBe(attachment?.sizeBytes);
  });
});
