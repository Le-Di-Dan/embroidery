/**
 * `APP5-B03` — the grant-scoped request status read, against real PostgreSQL.
 *
 * A double would prove the query calls what it calls. Only a database proves the
 * properties that matter here: that the request id comes out of the grant row
 * and not out of the caller, that one customer's two grants stay isolated from
 * each other, and that the columns behind the projection are the customer-safe
 * ones rather than a redaction applied afterwards.
 *
 * Every token in this suite is minted by the harness and stored only as its
 * peppered digest, so a passing test exercises the real APP4 resolution path.
 */
import { sql } from 'drizzle-orm';

import type { GrantScopedRequestView } from '../../application/status/read-grant-scoped-request.query';
import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import {
  callerFrom,
  createRequestStatusContext,
  mintToken,
  type RequestStatusTestContext,
  type SeededCatalogSubject,
} from './request-status-context';

const CALLER = callerFrom('203.0.113.10');

describe('APP5-B03 grant-scoped request status (integration)', () => {
  let context: RequestStatusTestContext;

  beforeAll(async () => {
    context = await createRequestStatusContext('app5-b03-status');
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.limiter.reset();
    await context.publishSecureLinkPolicy();
  });

  /**
   * One read, inside a request context.
   *
   * The context is real rather than stubbed because `ResolveSecureLink` audits
   * every outcome and takes the audit row's correlation id from it.
   */
  function attempt(token: string) {
    return context.asRequest(() => context.reader.read(CALLER, { token }));
  }

  /** Reads with a token and returns the view, failing loudly on a refusal. */
  async function read(token: string): Promise<GrantScopedRequestView> {
    const outcome = await attempt(token);
    if (outcome.outcome !== 'READ') {
      throw new Error(`Expected a read, got ${outcome.outcome}.`);
    }
    return outcome.view;
  }

  /** Runs a read and reports what came back, without letting a throw escape. */
  async function outcomeOf(token: string): Promise<string> {
    try {
      return (await attempt(token)).outcome;
    } catch (error: unknown) {
      return isSecureLinkError(error) ? `${error.code}|${error.message}` : 'OTHER_ERROR';
    }
  }

  /** Asserts the one indistinguishable refusal, whatever the cause. */
  async function expectUnavailable(token: string): Promise<void> {
    await expect(outcomeOf(token)).resolves.toBe(
      'SECURE_LINK_UNAVAILABLE|That secure link is not available.',
    );
  }

  describe('the grant is the only way in', () => {
    it('returns exactly the request its grant names', async () => {
      const seeded = await context.seedRequest();

      const view = await read(seeded.token);

      expect(view.requestId).toBe(seeded.requestId);
      expect(view.code).toBe(seeded.code);
      expect(view.status).toBe('NEW');
      expect(view.accessExpiresAt.toISOString()).toBe(seeded.grantExpiresAt.toISOString());
    });

    it('keeps one customer’s two requests isolated from each other', async () => {
      // The proof the checkpoint asks for: same customer identity, two requests,
      // two grants. A shared identity must not broaden either grant.
      const first = await context.seedRequest();
      const second = await context.seedRequest({ customerId: first.customerId });

      expect(first.customerId).toBe(second.customerId);
      expect(first.requestId).not.toBe(second.requestId);

      await expect(read(first.token)).resolves.toMatchObject({ requestId: first.requestId });
      await expect(read(second.token)).resolves.toMatchObject({ requestId: second.requestId });
    });

    it('cannot be addressed by the request code', async () => {
      const seeded = await context.seedRequest();

      // The code is returned for display and is not a credential. Presenting it
      // where the token goes resolves nothing — and the refusal is the same one
      // an unknown token gets, so the attempt learns neither that the code is
      // real nor that the request exists.
      await expectUnavailable(seeded.code);
      await expect(read(seeded.token)).resolves.toMatchObject({ code: seeded.code });
    });

    it('cannot be addressed by the request id', async () => {
      const seeded = await context.seedRequest();

      await expectUnavailable(seeded.requestId);
    });
  });

  describe('non-enumeration is preserved for every unusable grant', () => {
    it('refuses an unknown token', async () => {
      await context.seedRequest();
      await expectUnavailable(mintToken());
    });

    it('refuses an expired grant', async () => {
      const seeded = await context.seedRequest({ grantExpiresInMinutes: -1 });
      await expectUnavailable(seeded.token);
    });

    it('refuses a revoked grant', async () => {
      const seeded = await context.seedRequest({ grantStatus: 'REVOKED' });
      await expectUnavailable(seeded.token);
    });

    it('refuses a grant whose status is EXPIRED even before its instant passes', async () => {
      const seeded = await context.seedRequest({ grantStatus: 'EXPIRED' });
      await expectUnavailable(seeded.token);
    });

    it('answers all four causes identically', async () => {
      const live = await context.seedRequest();
      const expired = await context.seedRequest({ grantExpiresInMinutes: -1 });
      const revoked = await context.seedRequest({ grantStatus: 'REVOKED' });

      const refusals = await Promise.all(
        [mintToken(), expired.token, revoked.token, live.code].map(outcomeOf),
      );

      // One distinct answer across four different causes. A second entry here
      // would be an oracle, whichever cause produced it.
      expect(new Set(refusals).size).toBe(1);
      expect(refusals[0]).toContain('SECURE_LINK_UNAVAILABLE');
    });
  });

  describe('the catalog projection', () => {
    let subject: SeededCatalogSubject;

    beforeEach(async () => {
      subject = await context.seedCatalogSubject();
    });

    it('names the product and variant and keys the quantities to the variant', async () => {
      const seeded = await context.seedRequest({
        catalog: { productId: subject.productId, productVariantId: subject.productVariantId },
        quantities: [
          { productVariantId: subject.productVariantId, sizeLabel: 'M', quantity: 10 },
          { productVariantId: subject.productVariantId, sizeLabel: 'L', quantity: 14 },
        ],
      });

      const view = await read(seeded.token);

      expect(view.subject).toEqual({
        kind: 'CATALOG',
        productId: subject.productId,
        productVariantId: subject.productVariantId,
        productName: subject.productName,
        productSlug: subject.productSlug,
        variantColorName: subject.colorName,
        variantSizeLabel: subject.sizeLabel,
      });
      expect(view.quantities).toEqual([
        { productVariantId: subject.productVariantId, sizeLabel: 'M', quantity: 10 },
        { productVariantId: subject.productVariantId, sizeLabel: 'L', quantity: 14 },
      ]);
      expect(view.totalQuantity).toBe(24);
    });

    it('returns no catalog price, category or lifecycle state', async () => {
      const seeded = await context.seedRequest({
        catalog: { productId: subject.productId, productVariantId: subject.productVariantId },
      });

      const serialized = JSON.stringify(await read(seeded.token));

      expect(serialized).not.toContain('150000');
      expect(serialized).not.toContain('VND');
      expect(serialized).not.toContain('PUBLISHED');
    });
  });

  describe('the customer-owned projection', () => {
    it('describes the item and its stored dimensions, with no catalog identity', async () => {
      const seeded = await context.seedRequest({
        customerOwnedProduct: {
          name: 'Áo khoác jean',
          description: 'Thêu ở lưng.',
          physicalWidthMm: '250.00',
          physicalHeightMm: '300.00',
        },
        // `G01-D08` gives a COP line no variant; the column is NULL by rule.
        quantities: [{ sizeLabel: 'M', quantity: 1 }],
        assets: [{ role: 'COP_IMAGE' }, { role: 'REFERENCE' }],
      });

      const view = await read(seeded.token);

      expect(view.subject).toEqual({
        kind: 'CUSTOMER_OWNED',
        name: 'Áo khoác jean',
        description: 'Thêu ở lưng.',
        physicalWidthMm: '250.00',
        physicalHeightMm: '300.00',
      });
      expect(view.quantities).toEqual([
        { productVariantId: undefined, sizeLabel: 'M', quantity: 1 },
      ]);
      expect(view.totalQuantity).toBe(1);
      expect(view.assets.map((asset) => asset.role).sort()).toEqual(['COP_IMAGE', 'REFERENCE']);
    });

    it('returns no storage identity for an attached asset', async () => {
      const seeded = await context.seedRequest({
        customerOwnedProduct: { name: 'Áo khoác jean' },
        assets: [{ role: 'COP_IMAGE' }],
      });

      const view = await read(seeded.token);
      const serialized = JSON.stringify(view);

      expect(view.assets).toHaveLength(1);
      expect(Object.keys(view.assets[0] ?? {}).sort()).toEqual(['assetId', 'role']);
      expect(serialized).not.toContain('private/app5');
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('image/png');
      expect(serialized).not.toContain('sha256:');
    });
  });

  describe('status and the customer-visible reason', () => {
    it('reports NEW with no reason', async () => {
      const seeded = await context.seedRequest();
      const view = await read(seeded.token);

      expect(view.status).toBe('NEW');
      expect(view.customerVisibleReason).toBeUndefined();
    });

    it('reports UNDER_REVIEW with no reason', async () => {
      const seeded = await context.seedRequest();
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });

      const view = await read(seeded.token);

      expect(view.status).toBe('UNDER_REVIEW');
      expect(view.customerVisibleReason).toBeUndefined();
    });

    it('exposes the customer text on NEEDS_CLARIFICATION and never the internal reason', async () => {
      const seeded = await context.seedRequest();
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'UNDER_REVIEW',
        to: 'NEEDS_CLARIFICATION',
        reason: 'INTERNAL-ONLY: ảnh mờ, nghi ngờ spam',
        customerVisibleReason: 'Xưởng cần thêm ảnh rõ hơn.',
      });

      const view = await read(seeded.token);
      const serialized = JSON.stringify(view);

      expect(view.status).toBe('NEEDS_CLARIFICATION');
      expect(view.customerVisibleReason).toBe('Xưởng cần thêm ảnh rõ hơn.');
      expect(serialized).not.toContain('INTERNAL-ONLY');
      expect(serialized).not.toContain('spam');
    });

    it('exposes only the customer text on REJECTED', async () => {
      const seeded = await context.seedRequest();
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'UNDER_REVIEW',
        to: 'REJECTED',
        reason: 'INTERNAL-ONLY: nội dung vi phạm',
        customerVisibleReason: 'Rất tiếc, xưởng không nhận yêu cầu này.',
      });

      const view = await read(seeded.token);

      expect(view.status).toBe('REJECTED');
      expect(view.customerVisibleReason).toBe('Rất tiếc, xưởng không nhận yêu cầu này.');
      expect(JSON.stringify(view)).not.toContain('INTERNAL-ONLY');
    });

    it('follows the same privacy rule on CANCELLED, from the request row', async () => {
      const seeded = await context.seedRequest({
        status: 'CANCELLED',
        cancelledReason: 'INTERNAL-ONLY: trùng yêu cầu cũ',
        cancelledCustomerReason: 'Yêu cầu đã được huỷ theo đề nghị của bạn.',
      });

      const view = await read(seeded.token);

      expect(view.status).toBe('CANCELLED');
      expect(view.customerVisibleReason).toBe('Yêu cầu đã được huỷ theo đề nghị của bạn.');
      expect(JSON.stringify(view)).not.toContain('INTERNAL-ONLY');
    });

    it('does not resurface an earlier status’s message as a later one’s', async () => {
      const seeded = await context.seedRequest();
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'UNDER_REVIEW',
        to: 'NEEDS_CLARIFICATION',
        customerVisibleReason: 'Xưởng cần thêm ảnh rõ hơn.',
      });
      // Back to review, with nothing to tell the customer.
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEEDS_CLARIFICATION',
        to: 'UNDER_REVIEW',
      });

      const view = await read(seeded.token);

      expect(view.status).toBe('UNDER_REVIEW');
      expect(view.customerVisibleReason).toBeUndefined();
    });

    it('reports a status APP5 does not own truthfully rather than remapping it', async () => {
      // No APP5 transition reaches QUOTED — TR-LC11-05..09 are APP6+. If one
      // ever has, the customer is told the state the request is really in.
      const seeded = await context.seedRequest({ status: 'QUOTED' });

      const view = await read(seeded.token);

      expect(view.status).toBe('QUOTED');
      expect(view.customerVisibleReason).toBeUndefined();
    });
  });

  describe('what never crosses the boundary', () => {
    it('returns no grant, customer, session or moderation identity', async () => {
      const subject = await context.seedCatalogSubject();
      const seeded = await context.seedRequest({
        catalog: { productId: subject.productId, productVariantId: subject.productVariantId },
        quantities: [{ productVariantId: subject.productVariantId, quantity: 3 }],
        assets: [{ role: 'REFERENCE' }],
      });
      await context.recordTransition({
        requestId: seeded.requestId,
        from: 'NEW',
        to: 'UNDER_REVIEW',
      });

      const view = await read(seeded.token);
      const serialized = JSON.stringify(view);

      expect(serialized).not.toContain(seeded.token);
      expect(serialized).not.toContain(seeded.grantId);
      expect(serialized).not.toContain(seeded.customerId);
      // The customer note is intake data the Admin triages, not status content.
      expect(serialized).not.toContain('not part of the status projection');
      for (const forbidden of [
        'correlationId',
        'correlation_id',
        'actorKind',
        'adminId',
        'grantId',
        'customerId',
        'tokenHash',
        'submittedSessionId',
        'cancelledReason',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('publishes exactly the agreed field set', async () => {
      const seeded = await context.seedRequest();

      expect(Object.keys(await read(seeded.token)).sort()).toEqual([
        'accessExpiresAt',
        'assets',
        'code',
        'customerVisibleReason',
        'quantities',
        'requestId',
        'status',
        'subject',
        'submittedAt',
        'totalQuantity',
      ]);
    });
  });

  describe('the APP4 abuse controls still apply', () => {
    it('charges the shared secure-link budget and refuses beyond it', async () => {
      await context.reset();
      context.limiter.reset();
      await context.publishSecureLinkPolicy(2);
      const seeded = await context.seedRequest();

      await expect(read(seeded.token)).resolves.toBeDefined();
      await expect(read(seeded.token)).resolves.toBeDefined();

      const third = await attempt(seeded.token);
      expect(third.outcome).toBe('RATE_LIMITED');
      if (third.outcome === 'RATE_LIMITED') {
        expect(third.retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    it('charges the budget before the credential is looked at', async () => {
      await context.reset();
      context.limiter.reset();
      await context.publishSecureLinkPolicy(1);
      const seeded = await context.seedRequest();

      // One junk attempt spends the whole budget, so a *valid* token behind it
      // is refused for the limit rather than resolved. A limiter that charged
      // only for successes — or only for failures — could not produce this.
      await expectUnavailable(mintToken());

      const next = await attempt(seeded.token);
      expect(next.outcome).toBe('RATE_LIMITED');
    });

    it('fails closed when the abuse policy is not published', async () => {
      await context.reset();
      context.limiter.reset();
      const seeded = await context.seedRequest();

      // No policy row exists after the reset. The refusal is the server-side
      // one — not `SECURE_LINK_UNAVAILABLE`, which would file a configuration
      // fault under an answer meaning "your credential did not resolve".
      await expect(outcomeOf(seeded.token)).resolves.toBe('OTHER_ERROR');
    });
  });

  describe('reading is a read', () => {
    it('does not consume, expire or revoke the grant', async () => {
      const seeded = await context.seedRequest();

      await read(seeded.token);
      await read(seeded.token);
      // Still usable a third time: ADR-DB3-004 r2 makes a link multi-use within
      // its validity, so a customer refreshing their status page must not burn
      // it. The row is read directly rather than through the repository the
      // code under test uses, so a repository that lied could not hide it.
      await expect(read(seeded.token)).resolves.toMatchObject({ requestId: seeded.requestId });

      const { rows } = await context.disposable.client.db.execute<{
        readonly status: string;
        readonly revoked_at: Date | null;
      }>(sql`
        select status, revoked_at from secure_access_grants where id = ${seeded.grantId}
      `);

      expect(rows[0]?.status).toBe('ACTIVE');
      expect(rows[0]?.revoked_at).toBeNull();
    });

    it('writes no transition row', async () => {
      const seeded = await context.seedRequest();

      await read(seeded.token);

      const { rows } = await context.disposable.client.db.execute<{ readonly count: string }>(sql`
        select count(*)::text as count from custom_request_transitions
         where custom_request_id = ${seeded.requestId}
      `);

      expect(rows[0]?.count).toBe('0');
    });
  });
});
