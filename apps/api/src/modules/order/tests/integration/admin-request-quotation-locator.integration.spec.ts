/**
 * `APP6-A01` §4 — the quotation locator on the Admin request detail, over real
 * HTTP against PostgreSQL.
 *
 * The screen it exists for is authored at `/requests/{requestId}/quotation`, and
 * `APP6-B02`'s reads are addressed by `quotationId`. Nothing in the accepted
 * surface turned a `requestId` into one: `APP6-B01` creates a quotation without
 * setting `custom_requests.current_quotation_id`, and `APP6-B03` only writes
 * that pointer on send. An operator who drafts a quotation and reloads the page
 * would otherwise have no way back to it.
 *
 * The defining case is therefore the second one below — a DRAFT quotation whose
 * request's `current_quotation_id` is still NULL. A locator derived from that
 * pointer would return nothing there, so that test fails against the wrong
 * implementation while every other case still passes.
 *
 * Fixtures are raw SQL for the reason `admin-request-context.ts` records: this
 * suite reports on rows other checkpoints write, and going through their use
 * cases would make it a test of them instead.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createAdminRequestContext,
  dataOf,
  ROUTES,
  type AdminRequestTestContext,
} from './admin-request-context';

interface LocatorBody {
  readonly requestId: string;
  readonly quotationId: string | null;
  readonly status: string;
}

describe('APP6-A01 §4 — Admin request detail quotation locator', () => {
  let context: AdminRequestTestContext;
  let customerId: string;

  beforeAll(async () => {
    context = await createAdminRequestContext('app6-a01-locator');
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
    customerId = await context.seedCustomer();
  });

  /**
   * One quotation header, with its lifecycle state.
   *
   * `setCurrentQuotationPointer` is deliberately independent of the header's own
   * status: the whole question this suite settles is whether the locator reads
   * the relation or the pointer, so a fixture that always set both could not
   * tell the two implementations apart.
   */
  const seedQuotation = async (input: {
    readonly requestId: string;
    readonly status: string;
    readonly setCurrentQuotationPointer: boolean;
  }): Promise<string> => {
    const quotationId = newId();
    // Random rather than derived: `newId()` is UUIDv7, so ids minted in one
    // millisecond share a prefix and a derived code collides on
    // `uq_quotations__code`.
    const code = `QUO-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
    await context.disposable.client.db.execute(sql`
      insert into quotations (id, code, custom_request_id, status)
      values (${quotationId}, ${code}, ${input.requestId}, ${input.status})
    `);
    if (input.setCurrentQuotationPointer) {
      await context.disposable.client.db.execute(sql`
        update custom_requests set current_quotation_id = ${quotationId}
        where id = ${input.requestId}
      `);
    }
    return quotationId;
  };

  const readDetail = async (requestId: string): Promise<LocatorBody> => {
    const response = await request(context.server())
      .get(ROUTES.detail(requestId))
      .set('Cookie', context.adminCookie())
      .expect(200);
    return dataOf<LocatorBody>(response);
  };

  const pointerOf = async (requestId: string): Promise<string | null> => {
    const { rows } = await context.disposable.client.db.execute<{
      readonly current_quotation_id: string | null;
    }>(sql`select current_quotation_id from custom_requests where id = ${requestId}`);
    // `.rows`, not the result object: indexing the `QueryResult` itself yields
    // `undefined`, which would make every assertion below pass vacuously.
    return rows[0]?.current_quotation_id ?? null;
  };

  it('publishes quotationId as null when the request has no quotation', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });

    const body = await readDetail(seeded.requestId);

    // `null`, not absent: the key is always published, so a client can tell
    // "no quotation exists" from "this field is not in the contract".
    expect(body.quotationId).toBeNull();
    expect(Object.keys(body)).toContain('quotationId');
  });

  it('resolves an unsent DRAFT quotation while the current-quotation pointer is NULL', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });
    const quotationId = await seedQuotation({
      requestId: seeded.requestId,
      status: 'DRAFT',
      setCurrentQuotationPointer: false,
    });

    const body = await readDetail(seeded.requestId);

    expect(body.quotationId).toBe(quotationId);
    // The state the locator has to survive: the request is still UNDER_REVIEW
    // and nothing has been sent, so quotation existence is not inferable from
    // the request's own status either.
    expect(body.status).toBe('UNDER_REVIEW');
    // The pointer really is NULL, so the id above cannot have come from it.
    await expect(pointerOf(seeded.requestId)).resolves.toBeNull();
  });

  it('resolves the same quotation id once it has been sent and the pointer is set', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });
    const quotationId = await seedQuotation({
      requestId: seeded.requestId,
      status: 'DRAFT',
      setCurrentQuotationPointer: false,
    });

    const beforeSend = await readDetail(seeded.requestId);

    await context.disposable.client.db.execute(sql`
      update quotations set status = 'SENT' where id = ${quotationId}
    `);
    await context.disposable.client.db.execute(sql`
      update custom_requests set current_quotation_id = ${quotationId}
      where id = ${seeded.requestId}
    `);

    const afterSend = await readDetail(seeded.requestId);

    // A quotation's identity does not change when its lifecycle does.
    expect(afterSend.quotationId).toBe(quotationId);
    expect(afterSend.quotationId).toBe(beforeSend.quotationId);
  });

  it('resolves a later header state without special-casing it', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'QUOTE_ACCEPTED' });
    const quotationId = await seedQuotation({
      requestId: seeded.requestId,
      status: 'ACCEPTED',
      setCurrentQuotationPointer: true,
    });

    const body = await readDetail(seeded.requestId);

    expect(body.quotationId).toBe(quotationId);
  });

  it('never substitutes another request quotation', async () => {
    const withQuotation = await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });
    const withoutQuotation = await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });
    const otherCustomer = await context.seedCustomer({
      email: 'other@vidu-a01.test',
      // The verified-contact uniqueness index covers PHONE too, so reusing the
      // fixture number would collide before this test could reach its point.
      phone: '+84987654321',
    });
    const thirdParty = await context.seedRequest({
      customerId: otherCustomer,
      status: 'UNDER_REVIEW',
    });

    const ownQuotation = await seedQuotation({
      requestId: withQuotation.requestId,
      status: 'DRAFT',
      setCurrentQuotationPointer: false,
    });
    const foreignQuotation = await seedQuotation({
      requestId: thirdParty.requestId,
      status: 'SENT',
      setCurrentQuotationPointer: true,
    });

    // The request that owns one gets exactly its own.
    const owner = await readDetail(withQuotation.requestId);
    expect(owner.quotationId).toBe(ownQuotation);

    // The one that owns none stays null even though quotations exist nearby — a
    // "first row" read with a mis-scoped predicate would hand it one of these.
    const empty = await readDetail(withoutQuotation.requestId);
    expect(empty.quotationId).toBeNull();
    expect(empty.quotationId).not.toBe(ownQuotation);
    expect(empty.quotationId).not.toBe(foreignQuotation);

    // And the third party's request keeps its own.
    const other = await readDetail(thirdParty.requestId);
    expect(other.quotationId).toBe(foreignQuotation);
  });

  it('publishes no quotation content beside the locator, and writes nothing', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });
    const quotationId = await seedQuotation({
      requestId: seeded.requestId,
      status: 'DRAFT',
      setCurrentQuotationPointer: false,
    });

    const { rows: before } = await context.disposable.client.db.execute<{
      readonly updated_at: Date;
    }>(sql`select updated_at from quotations where id = ${quotationId}`);

    const body = await readDetail(seeded.requestId);

    // A locator, not a projection: no amount, version, validity or state.
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'totalAmount',
      'subtotalAmount',
      'depositAmount',
      'depositPercent',
      'currentVersionId',
      'quotationCode',
      'quotationStatus',
      'validUntil',
      'lineItems',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(body.quotationId).toBe(quotationId);

    // A read wrote nothing: neither the header nor the request's pointer moved.
    const { rows: after } = await context.disposable.client.db.execute<{
      readonly updated_at: Date;
      readonly status: string;
    }>(sql`select updated_at, status from quotations where id = ${quotationId}`);
    expect(before[0]).toBeDefined();
    expect(after[0]?.updated_at).toEqual(before[0]?.updated_at);
    expect(after[0]?.status).toBe('DRAFT');
    await expect(pointerOf(seeded.requestId)).resolves.toBeNull();
  });
});
