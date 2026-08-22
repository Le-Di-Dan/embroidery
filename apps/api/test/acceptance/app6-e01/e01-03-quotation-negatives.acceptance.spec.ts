/**
 * `APP6-E01-03` — quotation staleness, expiry and immutability.
 *
 * The commercial lane's three refusals, composed rather than unit-tested. Every
 * lifecycle state here is still produced by an owning operation: the request
 * reaches `QUOTED` through `APP6-B03` and `QUOTE_ACCEPTED` through `APP6-B05`,
 * and nothing in this file writes a `custom_requests.status`.
 *
 * ### The one fixture, and why it has to be one
 *
 * A window that has **already elapsed** is not representable through the
 * delivered surface. `APP6-B03` reads the validity duration from published
 * policy and stamps `valid_from` at the send instant, and
 * `trg_quotation_versions__reject_mutation` freezes both the moment the version
 * leaves `DRAFT` — so an expired version can only be created by *sending in the
 * past*, and it can never be back-dated afterwards, by this harness or by
 * anything else. The expiry leg therefore commits its second version through the
 * delivered `QuotationRepository` with a past instant, exactly as `APP6-B04` and
 * `APP6-B05` recorded. The request's own lifecycle state is untouched by that
 * fixture: it was produced by the real send, and it stays where the real send
 * left it.
 *
 * **No expiry sweep runs.** `SE-015` is out of APP6's scope by `APP6-R00`, and
 * the point of the leg is that `GRD-006` refuses in transaction without one.
 */
import { TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../../src/modules/quotation/domain/repositories/quotation.repository';
import {
  createApp6AcceptanceContext,
  type App6AcceptanceContext,
  type SeededCommission,
} from './app6-e01-context';
import {
  codeOf,
  createJourneyDriver,
  dataOf,
  pricingAt,
  type JourneyDriver,
} from './app6-e01-journey';

const STALE_SOURCE = '203.0.113.31';
const EXPIRY_SOURCE = '203.0.113.32';

interface Quoted {
  readonly commission: SeededCommission;
  readonly quotationId: string;
  readonly versionId: string;
}

describe('APP6-E01-03 — quotation stale, expiry and immutability', () => {
  let context: App6AcceptanceContext;
  let journey: JourneyDriver;
  let stale: Quoted;
  let staleSecondVersionId: string;
  let expiring: Quoted;
  let expiredVersionId: string;

  beforeAll(async () => {
    context = await createApp6AcceptanceContext('app6-e01-03-quote-negatives');
    journey = createJourneyDriver(
      () => context.server(),
      () => context.adminCookie(),
      STALE_SOURCE,
    );
    await context.reset();
    await context.publishDeliveredPolicies();
    stale = await quoteThrough(await context.seedCommission(), 150_000);
    expiring = await quoteThrough(await context.seedCommission(), 160_000);
  }, 180_000);

  afterAll(async () => {
    await context.close();
  });

  /** Drives `APP6-B01` and `APP6-B03` for real, leaving the request at `QUOTED`. */
  async function quoteThrough(commission: SeededCommission, unitPrice: number): Promise<Quoted> {
    const drafted = await journey
      .createQuotation(commission.requestId, pricingAt(unitPrice))
      .expect(201);
    const draft = dataOf<{ readonly quotationId: string; readonly versionId: string }>(drafted);
    await journey.sendQuotation(draft.quotationId, draft.versionId).expect(200);
    return { commission, quotationId: draft.quotationId, versionId: draft.versionId };
  }

  const statusOf = async (requestId: string): Promise<string> => {
    const [row] = await context.rows<{ readonly status: string }>(
      sql`select status from custom_requests where id = ${requestId}`,
    );
    return row?.status ?? 'MISSING';
  };

  const versionRow = async (
    versionId: string,
  ): Promise<{
    readonly status: string;
    readonly total_amount: string;
    readonly valid_until: Date | null;
    readonly expired_at: Date | null;
  }> => {
    const [row] = await context.rows<{
      readonly status: string;
      readonly total_amount: string;
      readonly valid_until: Date | null;
      readonly expired_at: Date | null;
    }>(sql`
      select status, total_amount, valid_until, expired_at
        from quotation_versions where id = ${versionId}
    `);
    if (row === undefined) throw new Error('The quotation version is missing.');
    return row;
  };

  it('a sent version is frozen: its amounts cannot be rewritten', async () => {
    const before = await versionRow(stale.versionId);
    expect(before.status).toBe('SENT');

    await expect(
      context.rows(sql`
        update quotation_versions set total_amount = '1.00' where id = ${stale.versionId}
      `),
    ).rejects.toThrow();
    await expect(
      context.rows(sql`
        update quotation_versions set valid_until = now() - interval '1 day'
         where id = ${stale.versionId}
      `),
    ).rejects.toThrow();

    const after = await versionRow(stale.versionId);
    expect(after.total_amount).toBe(before.total_amount);
    expect(after.valid_until).toEqual(before.valid_until);
  });

  it('a newer sent version supersedes the old one, and the customer sees the new one', async () => {
    const drafted = await journey
      .addQuotationVersion(stale.quotationId, pricingAt(139_000))
      .expect(201);
    staleSecondVersionId = dataOf<{ readonly versionId: string }>(drafted).versionId;

    await journey.sendQuotation(stale.quotationId, staleSecondVersionId).expect(200);

    expect((await versionRow(stale.versionId)).status).toBe('SUPERSEDED');
    expect((await versionRow(staleSecondVersionId)).status).toBe('SENT');

    const read = await journey.readQuotation(stale.commission.token, STALE_SOURCE).expect(200);
    expect(dataOf<{ readonly versionId: string }>(read).versionId).toBe(staleSecondVersionId);
    // Superseding is not a lifecycle move: the request is still QUOTED.
    expect(await statusOf(stale.commission.requestId)).toBe('QUOTED');
  });

  it('accepting the superseded version is refused as QUOTE_VERSION_STALE and writes nothing', async () => {
    await context.addStepUp(stale.commission);

    const refused = await journey
      .acceptQuotation(stale.commission.token, stale.versionId, STALE_SOURCE)
      .expect(409);
    expect(codeOf(refused)).toBe('QUOTE_VERSION_STALE');

    // Nothing moved and nothing was recorded — not on the stale version, and not
    // silently on the live one instead.
    expect(await statusOf(stale.commission.requestId)).toBe('QUOTED');
    expect((await versionRow(stale.versionId)).status).toBe('SUPERSEDED');
    expect((await versionRow(staleSecondVersionId)).status).toBe('SENT');
    expect(
      await context.count(sql`select count(*)::text as count from quotation_acceptances`),
    ).toBe(0);
  });

  it('accepting the exact current version commits, and its evidence is immutable', async () => {
    const accepted = await journey
      .acceptQuotation(stale.commission.token, staleSecondVersionId, STALE_SOURCE)
      .expect(200);
    const view = dataOf<{
      readonly requestStatus: string;
      readonly acceptedTotalAmount: string;
      readonly replayed: boolean;
    }>(accepted);
    expect(view.requestStatus).toBe('QUOTE_ACCEPTED');
    expect(view.replayed).toBe(false);

    const [evidence] = await context.rows<{
      readonly id: string;
      readonly accepted_total_amount: string;
    }>(sql`
      select id, accepted_total_amount from quotation_acceptances
       where quotation_version_id = ${staleSecondVersionId}
    `);
    expect(evidence?.accepted_total_amount).toBe(view.acceptedTotalAmount);

    // `trg_quotation_acceptances__reject_mutation`: committed evidence is not
    // editable, so a later dispute cannot be settled by rewriting it.
    await expect(
      context.rows(sql`
        update quotation_acceptances set accepted_total_amount = '1.00'
         where id = ${evidence!.id}
      `),
    ).rejects.toThrow();
    const [unchanged] = await context.rows<{ readonly accepted_total_amount: string }>(
      sql`select accepted_total_amount from quotation_acceptances where id = ${evidence!.id}`,
    );
    expect(unchanged?.accepted_total_amount).toBe(view.acceptedTotalAmount);
  });

  it('re-accepting the same version replays the first acceptance and writes no second one', async () => {
    const replay = await journey
      .acceptQuotation(stale.commission.token, staleSecondVersionId, STALE_SOURCE)
      .expect(200);
    expect(dataOf<{ readonly replayed: boolean }>(replay).replayed).toBe(true);
    expect(
      await context.count(sql`
        select count(*)::text as count from quotation_acceptances
         where quotation_version_id = ${staleSecondVersionId}
      `),
    ).toBe(1);
  });

  it('B04 tells the truth about a window that has closed, and returns the version in full', async () => {
    // The one fixture this case needs; see the file header for why it is the
    // only representable way to reach an elapsed window.
    const repository = context.app.get<QuotationRepository>(QUOTATION_REPOSITORY);
    const transactions = context.app.get(TransactionManager);

    const drafted = await journey
      .addQuotationVersion(expiring.quotationId, pricingAt(158_000))
      .expect(201);
    expiredVersionId = dataOf<{ readonly versionId: string }>(drafted).versionId;

    const sentAt = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const validUntil = new Date(Date.now() - 23 * 24 * 60 * 60_000);
    await transactions.runInTransaction(async () => {
      await repository.send(expiredVersionId as QuotationVersionId, validUntil, sentAt);
      await repository.setCurrentVersion(
        expiring.quotationId as QuotationId,
        expiredVersionId as QuotationVersionId,
      );
    });

    const read = await journey.readQuotation(expiring.commission.token, EXPIRY_SOURCE).expect(200);
    const view = dataOf<{
      readonly versionId: string;
      readonly expired: boolean;
      readonly totalAmount: string;
      readonly lineItems: readonly unknown[];
    }>(read);

    expect(view.versionId).toBe(expiredVersionId);
    expect(view.expired).toBe(true);
    // Flagged, not hidden: the customer can still read what they were offered.
    expect(view.totalAmount).toBe('3842000.00');
    expect(view.lineItems.length).toBeGreaterThan(0);
    // The read wrote nothing: no sweep, no status change.
    expect((await versionRow(expiredVersionId)).status).toBe('SENT');
    expect((await versionRow(expiredVersionId)).expired_at).toBeNull();
  });

  it('GRD-006 refuses acceptance of an elapsed window in transaction, with no sweep', async () => {
    await context.addStepUp(expiring.commission);

    const refused = await journey
      .acceptQuotation(expiring.commission.token, expiredVersionId, EXPIRY_SOURCE)
      .expect(409);
    expect(codeOf(refused)).toBe('QUOTE_VERSION_STALE');

    // Refused in transaction: the request never moved, no evidence exists, and
    // the version was not marked EXPIRED on the way past — nothing swept it.
    expect(await statusOf(expiring.commission.requestId)).toBe('QUOTED');
    const row = await versionRow(expiredVersionId);
    expect(row.status).toBe('SENT');
    expect(row.expired_at).toBeNull();
    expect(
      await context.count(sql`
        select count(*)::text as count from quotation_acceptances
         where quotation_version_id = ${expiredVersionId}
      `),
    ).toBe(0);
  });
});
