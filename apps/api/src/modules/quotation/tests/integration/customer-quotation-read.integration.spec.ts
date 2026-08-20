/**
 * `APP6-B04` — the customer's grant-scoped quotation read, end to end.
 *
 * Real module, real secure-link admission, real peppered digest, real AGG-14
 * repository, real Ordering pointer port, disposable database. Nothing under
 * test is doubled.
 *
 * What each group proves is stated on the group.
 */
import { sql } from 'drizzle-orm';

import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import type {
  QuotationId,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import {
  callerFrom,
  createCustomerQuotationContext,
  mintToken,
  type CustomerQuotationTestContext,
} from './customer-quotation-context';

jest.setTimeout(180_000);

const CALLER = callerFrom('203.0.113.44');

describe('APP6-B04 — customer secure quotation read', () => {
  let context: CustomerQuotationTestContext;

  beforeAll(async () => {
    context = await createCustomerQuotationContext('app6-b04-customer-quotation');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.publishSecureLinkPolicy();
  });

  /** One request with one sent, current quotation version. */
  async function seedQuoted(options: {
    readonly customerId?: string;
    readonly unitPrice: number;
    readonly adjustment?: number;
    readonly validUntil?: Date;
    readonly sentAt?: Date;
  }): Promise<{
    readonly requestId: string;
    readonly customerId: string;
    readonly token: string;
    readonly quotationId: QuotationId;
    readonly versionId: QuotationVersionId;
  }> {
    const seeded = await context.seedRequest({ customerId: options.customerId });
    const quotationId = await context.seedQuotation(seeded.requestId);
    const versionId = await context.addDraft(quotationId, {
      unitPrice: options.unitPrice,
      adjustment: options.adjustment,
    });
    await context.sendVersion({
      requestId: seeded.requestId,
      quotationId,
      versionId,
      validUntil: options.validUntil ?? new Date(Date.now() + 7 * 24 * 60 * 60_000),
      ...(options.sentAt === undefined ? {} : { sentAt: options.sentAt }),
    });
    return { ...seeded, quotationId, versionId };
  }

  /** The failure a definitive refusal reported, or a thrown error if it succeeded. */
  async function refusalOf(token: string): Promise<string> {
    try {
      await context.asRequest(() => context.reader.read(CALLER, { token }));
    } catch (error: unknown) {
      if (isSecureLinkError(error)) {
        return error.code;
      }
      throw error;
    }
    throw new Error('Expected the read to be refused, but it succeeded.');
  }

  describe('the grant selects the target, and the pointers select the version', () => {
    it('returns the pointer-selected version, its own lines, and exact money strings', async () => {
      const seeded = await seedQuoted({ unitPrice: 150_000, adjustment: 20_000 });

      const outcome = await context.asRequest(() =>
        context.reader.read(CALLER, { token: seeded.token }),
      );

      expect(outcome.outcome).toBe('READ');
      if (outcome.outcome !== 'READ') return;
      const view = outcome.view;

      // The exact version the pointers name, returned so `APP6-B05` can bind a
      // decision to it.
      expect(view.versionId).toBe(seeded.versionId);
      expect(view.version).toBe(1);
      expect(view.status).toBe('SENT');
      expect(view.quotationStatus).toBe('SENT');
      expect(view.currencyCode).toBe('VND');

      // Every amount is the persisted `numeric(14,2)` string, not a number and
      // not re-derived. 150000×10 + 20000 + 50000 = 1_570_000; 40% = 628_000.
      expect(view.subtotalAmount).toBe('1500000.00');
      expect(view.manualAdjustmentAmount).toBe('20000.00');
      expect(view.shippingFeeAmount).toBe('50000.00');
      expect(view.totalAmount).toBe('1570000.00');
      expect(view.depositPercent).toBe('40.00');
      expect(view.depositAmount).toBe('628000.00');
      expect(view.remainingAmount).toBe('942000.00');
      for (const amount of [
        view.subtotalAmount,
        view.manualAdjustmentAmount,
        view.shippingFeeAmount,
        view.totalAmount,
        view.depositPercent,
        view.depositAmount,
        view.remainingAmount,
      ]) {
        expect(typeof amount).toBe('string');
      }

      expect(view.lineItems).toHaveLength(1);
      expect(view.lineItems[0]?.unitPriceAmount).toBe('150000.00');
      expect(view.lineItems[0]?.lineTotalAmount).toBe('1500000.00');
      expect(typeof view.lineItems[0]?.lineTotalAmount).toBe('string');

      expect(view.expired).toBe(false);
      expect(view.sentAt).toBeInstanceOf(Date);
      expect(view.validUntil).toBeInstanceOf(Date);
      expect(view.accessExpiresAt).toBeInstanceOf(Date);
    });

    it('carries no operator evidence and no identifier the caller did not present', async () => {
      const seeded = await seedQuoted({ unitPrice: 90_000, adjustment: 15_000 });

      const outcome = await context.asRequest(() =>
        context.reader.read(CALLER, { token: seeded.token }),
      );
      if (outcome.outcome !== 'READ') throw new Error('expected a read');
      const keys = Object.keys(outcome.view);

      // The adjustment amount is shown; the operator's internal note is not,
      // even though the row carries one (the fixture priced an adjustment, so
      // CST-064's [R] forced a reason to exist).
      const [stored] = await context.rows<{ readonly adjustment_reason: string | null }>(
        sql`select adjustment_reason from quotation_versions where id = ${seeded.versionId}`,
      );
      expect(stored?.adjustment_reason).not.toBeNull();
      expect(keys).not.toContain('adjustmentReason');

      for (const forbidden of [
        'stitchCount',
        'customerId',
        'customRequestId',
        'quotationId',
        'grantId',
        'scopeKind',
        'token',
        'tokenHash',
        'acceptedAt',
        'supersededAt',
        'expiredAt',
        'createdAt',
      ]) {
        expect(keys).not.toContain(forbidden);
      }
      expect(JSON.stringify(outcome.view)).not.toContain(seeded.token);
      expect(JSON.stringify(outcome.view)).not.toContain(seeded.customerId);
      expect(Object.keys(outcome.view.lineItems[0] ?? {})).not.toContain('skuId');
    });
  });

  describe('one customer, two requests', () => {
    it('answers each token with its own request’s quotation, and mixes no lines', async () => {
      const a = await seedQuoted({ unitPrice: 111_000 });
      const b = await seedQuoted({ customerId: a.customerId, unitPrice: 222_000 });
      expect(b.customerId).toBe(a.customerId);

      const readA = await context.asRequest(() => context.reader.read(CALLER, { token: a.token }));
      const readB = await context.asRequest(() => context.reader.read(CALLER, { token: b.token }));
      if (readA.outcome !== 'READ' || readB.outcome !== 'READ') throw new Error('expected reads');

      expect(readA.view.versionId).toBe(a.versionId);
      expect(readB.view.versionId).toBe(b.versionId);
      expect(readA.view.lineItems[0]?.unitPriceAmount).toBe('111000.00');
      expect(readB.view.lineItems[0]?.unitPriceAmount).toBe('222000.00');
      expect(readA.view.quotationCode).not.toBe(readB.view.quotationCode);
      // And there is no field on the command through which token A could have
      // asked for B's quotation: the command type carries a token and nothing
      // else, which is why this is an isolation proof rather than a comparison.
    });
  });

  describe('the current version is whatever the pointer says now', () => {
    it('returns the newer version after a later send, and never the superseded one', async () => {
      const seeded = await seedQuoted({ unitPrice: 100_000 });

      const before = await context.asRequest(() =>
        context.reader.read(CALLER, { token: seeded.token }),
      );
      if (before.outcome !== 'READ') throw new Error('expected a read');
      expect(before.view.versionId).toBe(seeded.versionId);

      const secondVersionId = await context.addDraft(seeded.quotationId, { unitPrice: 130_000 });
      await context.sendVersion({
        requestId: seeded.requestId,
        quotationId: seeded.quotationId,
        versionId: secondVersionId,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      });

      const after = await context.asRequest(() =>
        context.reader.read(CALLER, { token: seeded.token }),
      );
      if (after.outcome !== 'READ') throw new Error('expected a read');

      expect(after.view.versionId).toBe(secondVersionId);
      expect(after.view.versionId).not.toBe(seeded.versionId);
      expect(after.view.version).toBe(2);
      expect(after.view.lineItems[0]?.unitPriceAmount).toBe('130000.00');
      // The first version is still on disk, still `SENT`-shaped history, and is
      // never served as current again.
      const [old] = await context.rows<{ readonly status: string }>(
        sql`select status from quotation_versions where id = ${seeded.versionId}`,
      );
      expect(old?.status).toBe('SUPERSEDED');
    });
  });

  describe('an expired quotation is a quotation, not a broken link', () => {
    it('returns the lapsed offer in full, flagged expired, and writes nothing', async () => {
      // Sent two hours ago with a window that closed an hour ago. The window
      // must be written at send time: `ck_quotation_versions__validity_window`
      // requires `valid_from < valid_until`, and the S24 freeze trigger makes
      // both columns immutable once the version leaves DRAFT — so a lapsed
      // offer cannot be manufactured after the fact.
      const seeded = await seedQuoted({
        unitPrice: 175_000,
        sentAt: new Date(Date.now() - 2 * 60 * 60_000),
        validUntil: new Date(Date.now() - 60 * 60_000),
      });
      const [before] = await context.rows(
        sql`select status, sent_at, valid_until, expired_at from quotation_versions
            where id = ${seeded.versionId}`,
      );

      const outcome = await context.asRequest(() =>
        context.reader.read(CALLER, { token: seeded.token }),
      );

      expect(outcome.outcome).toBe('READ');
      if (outcome.outcome !== 'READ') return;
      expect(outcome.view.expired).toBe(true);
      // Truthful, not collapsed: the totals are still there and the stored
      // status is still what the sweep has not yet changed.
      expect(outcome.view.status).toBe('SENT');
      expect(outcome.view.totalAmount).toBe('1800000.00');
      expect(outcome.view.lineItems).toHaveLength(1);

      const [after] = await context.rows(
        sql`select status, sent_at, valid_until, expired_at from quotation_versions
            where id = ${seeded.versionId}`,
      );
      expect(after).toEqual(before);
    });

    it('reports a version the sweep has already expired as expired', async () => {
      const seeded = await seedQuoted({ unitPrice: 120_000 });
      await context.rows(
        sql`update quotation_versions set status = 'EXPIRED', expired_at = now()
            where id = ${seeded.versionId}`,
      );

      const outcome = await context.asRequest(() =>
        context.reader.read(CALLER, { token: seeded.token }),
      );
      if (outcome.outcome !== 'READ') throw new Error('expected a read');

      expect(outcome.view.status).toBe('EXPIRED');
      expect(outcome.view.expired).toBe(true);
    });
  });

  describe('every definitive unavailability is the same answer', () => {
    it('collapses an unknown token to SECURE_LINK_UNAVAILABLE', async () => {
      await expect(refusalOf(mintToken())).resolves.toBe('SECURE_LINK_UNAVAILABLE');
    });

    it('collapses a revoked grant and an expired grant alike', async () => {
      const revoked = await context.seedRequest({ grantStatus: 'REVOKED' });
      const lapsed = await context.seedRequest({ grantExpiresInMinutes: -5 });

      for (const seeded of [revoked, lapsed]) {
        await expect(refusalOf(seeded.token)).resolves.toBe('SECURE_LINK_UNAVAILABLE');
      }
      // A *wrong-scope* grant is not seeded here because it cannot exist:
      // `GRANT_SCOPE_KINDS` has one member and `ck_secure_access_grants__scope_kind_allowed`
      // rejects any other, so the resolver's scope predicate is unfalsifiable
      // from this suite. It is exercised where it is owned (`APP4-B06`), and
      // this read reaches it through the same admission either way.
    });

    it('collapses a live grant on a request with no current quotation', async () => {
      const seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });

      await expect(refusalOf(seeded.token)).resolves.toBe('SECURE_LINK_UNAVAILABLE');
    });

    it('collapses a quotation pointer whose quotation has no current version', async () => {
      const seeded = await context.seedRequest();
      const quotationId = await context.seedQuotation(seeded.requestId);
      await context.addDraft(quotationId, { unitPrice: 100_000 });
      // The request points at a quotation that was never sent, so the second
      // pointer is unset. `APP6-B03` sets both together; a half-set pair is not
      // a state this read reports on.
      await context.rows(
        sql`update custom_requests set current_quotation_id = ${quotationId}
            where id = ${seeded.requestId}`,
      );

      await expect(refusalOf(seeded.token)).resolves.toBe('SECURE_LINK_UNAVAILABLE');
    });

    it('collapses a pointer aimed at another request’s quotation', async () => {
      const mine = await context.seedRequest();
      const theirs = await seedQuoted({ unitPrice: 300_000 });
      // G-DB7-04 checked on the read side: the pointer resolves, but the
      // quotation belongs to somebody else's request.
      await context.rows(
        sql`update custom_requests set current_quotation_id = ${theirs.quotationId}
            where id = ${mine.requestId}`,
      );

      await expect(refusalOf(mine.token)).resolves.toBe('SECURE_LINK_UNAVAILABLE');
    });
  });

  describe('reading changes nothing', () => {
    it('leaves the request, the quotation, the version and the event log untouched', async () => {
      const seeded = await seedQuoted({ unitPrice: 250_000 });

      const snapshot = async (): Promise<unknown[]> => [
        await context.rows(sql`select * from custom_requests order by id`),
        await context.rows(sql`select * from quotations order by id`),
        await context.rows(sql`select * from quotation_versions order by id`),
        await context.rows(sql`select * from quotation_line_items order by id`),
        await context.rows(sql`select * from secure_access_grants order by id`),
      ];

      const before = await snapshot();
      await context.asRequest(() => context.reader.read(CALLER, { token: seeded.token }));
      await context.asRequest(() => context.reader.read(CALLER, { token: seeded.token }));
      expect(await snapshot()).toEqual(before);

      // No business evidence at all: no transition, no outbox event, and no
      // audit row about the quotation. The only audit rows are APP4's own
      // grant-resolution evidence, written because a token was resolved — the
      // same rows `APP5-B03` produces — and never a `quotation.*` action.
      expect(await context.rows(sql`select 1 from custom_request_transitions`)).toHaveLength(0);
      expect(await context.rows(sql`select 1 from outbox_events`)).toHaveLength(0);
      expect(
        await context.rows(sql`select 1 from audit_events where action like 'quotation%'`),
      ).toHaveLength(0);
      expect((await context.rows(sql`select 1 from audit_events`)).length).toBeGreaterThan(0);
    });
  });
});
