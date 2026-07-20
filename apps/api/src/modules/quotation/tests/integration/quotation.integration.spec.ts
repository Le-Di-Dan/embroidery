/**
 * AGG-13 Custom Request and AGG-14 Quotation persistence against a real
 * PostgreSQL instance (DB7-CP4).
 *
 * TBL-037..TBL-042 and TBL-050..TBL-053. They share a suite because the
 * conversion guards span both: G-DB7-04 (the request's current quotation),
 * G-DB7-20 (GRD-006, acceptance binds the exact current sent version),
 * G-DB7-22 and G-DB7-25 (lifecycle legality).
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { OrderModule } from '../../../order/order.module';
import { CUSTOM_REQUEST_REPOSITORY } from '../../../order/domain/repositories/custom-request.repository';
import type {
  CustomRequestId,
  CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { QuotationModule } from '../../quotation.module';
import { QUOTATION_REPOSITORY } from '../../domain/repositories/quotation.repository';
import type {
  QuotationId,
  QuotationRepository,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('quotation persistence (integration)', () => {
  let context: PersistenceTestContext;
  let requests: CustomRequestRepository;
  let quotations: QuotationRepository;
  let customerId: string;
  let adminId: string;
  let grantId: string;
  let challengeId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-quotation', [OrderModule, QuotationModule]);
    requests = context.get(CUSTOM_REQUEST_REPOSITORY);
    quotations = context.get(QUOTATION_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    const db = context.disposable.client.db;

    customerId = newId();
    adminId = newId();
    const contactId = newId();

    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Quote Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
      values (${contactId}, ${customerId}, 'EMAIL', ${`q-${customerId}@example.com`},
              ${`q-${customerId}@example.com`}, true, now(), 'OTP')
    `);
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`admin-${adminId}@example.com`}, 'Admin', 'ACTIVE')
    `);
    challengeId = newId();
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${challengeId}, ${contactId}, 'EMAIL', ${`q-${customerId}@example.com`},
              'STEP_UP', 'hash', 'VERIFIED', now() + interval '1 hour', now())
    `);
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  async function submitRequest(): Promise<CustomRequestId> {
    const id = newId() as CustomRequestId;
    await context.inTransaction(() =>
      requests.submit({
        id,
        code: `REQ-${id}`,
        customerId,
        breakdown: [
          { productVariantId: undefined, sizeLabel: 'M', quantity: 10 },
          { productVariantId: undefined, sizeLabel: 'L', quantity: 15 },
        ],
      }),
    );
    return id;
  }

  async function seedGrant(requestId: CustomRequestId): Promise<string> {
    grantId = newId();
    await context.disposable.client.db.execute(sql`
      insert into secure_access_grants
        (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
      values (${grantId}, ${customerId}, ${requestId}, ${`hash-${grantId}`},
              'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
    `);
    return grantId;
  }

  describe('quotation versioning', () => {
    async function seedQuotation(requestId: CustomRequestId): Promise<QuotationId> {
      const id = newId() as QuotationId;
      await context.inTransaction(() => quotations.createForRequest(id, `QUO-${id}`, requestId));
      return id;
    }

    function versionInput(quotationId: QuotationId, id = newId() as QuotationVersionId) {
      return {
        id,
        quotationId,
        quantityTotal: 25,
        subtotalAmount: '2500000.00',
        shippingFeeAmount: '50000.00',
        totalAmount: '2550000.00',
        depositPercent: '30.00',
        depositAmount: '765000.00',
        remainingAmount: '1785000.00',
        lineItems: [
          {
            position: 1,
            lineKind: 'EMBROIDERY' as const,
            description: 'Chest logo',
            skuId: undefined,
            quantity: 25,
            unitPriceAmount: '100000.00',
            lineTotalAmount: '2500000.00',
          },
        ],
      };
    }

    it('creates a version with its line items', async () => {
      const requestId = await submitRequest();
      const quotationId = await seedQuotation(requestId);

      const version = await context.inTransaction(() =>
        quotations.addVersion(versionInput(quotationId)),
      );

      expect(version.version).toBe(1);
      expect(version.totalAmount).toBe('2550000.00');
      await expect(quotations.loadLineItems(version.id)).resolves.toHaveLength(1);
    });

    it('allows only one quotation per request', async () => {
      const requestId = await submitRequest();
      await seedQuotation(requestId);

      const error = await failureOf(() => seedQuotation(requestId));

      expect(error.code).toBe('QUOTATION_ALREADY_EXISTS_FOR_REQUEST');
    });

    it('rolls the version back when a line item is invalid', async () => {
      const requestId = await submitRequest();
      const quotationId = await seedQuotation(requestId);
      const versionId = newId() as QuotationVersionId;

      await expect(
        context.inTransaction(() =>
          quotations.addVersion({
            ...versionInput(quotationId, versionId),
            lineItems: [
              { ...versionInput(quotationId).lineItems[0]!, position: 1 },
              { ...versionInput(quotationId).lineItems[0]!, position: 1 },
            ],
          }),
        ),
      ).rejects.toBeDefined();

      // A total with no lines behind it is a price nobody can explain.
      await expect(quotations.loadVersion(versionId)).resolves.toBeUndefined();
    });

    it('sends a version and makes it current', async () => {
      const requestId = await submitRequest();
      const quotationId = await seedQuotation(requestId);
      const version = await context.inTransaction(() =>
        quotations.addVersion(versionInput(quotationId)),
      );

      const sent = await context.inTransaction(() =>
        quotations.send(version.id, new Date(Date.now() + HOUR_MS), new Date()),
      );

      expect(sent.status).toBe('SENT');
      await expect(quotations.findById(quotationId)).resolves.toMatchObject({
        currentVersionId: version.id,
      });
    });

    it('refuses a version belonging to another quotation (G-DB7-03)', async () => {
      const mineRequest = await submitRequest();
      const theirsRequest = await submitRequest();
      const mine = await seedQuotation(mineRequest);
      const theirs = await seedQuotation(theirsRequest);
      const theirVersion = await context.inTransaction(() =>
        quotations.addVersion(versionInput(theirs)),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => quotations.setCurrentVersion(mine, theirVersion.id)),
      );

      expect(error.code).toBe('VERSION_BELONGS_TO_ANOTHER_QUOTATION');
    });

    it('refuses a quotation belonging to another request (G-DB7-04)', async () => {
      const mineRequest = await submitRequest();
      const theirsRequest = await submitRequest();
      const theirsQuotation = await seedQuotation(theirsRequest);

      const error = await failureOf(() =>
        context.inTransaction(() => requests.setCurrentQuotation(mineRequest, theirsQuotation)),
      );

      expect(error.code).toBe('QUOTATION_BELONGS_TO_ANOTHER_REQUEST');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });
  });

  describe('acceptance (G-DB7-20 / GRD-006)', () => {
    /**
     * `sentAt` is a parameter because `ck_quotation_versions__validity_window`
     * requires `valid_from < valid_until`: an already-expired version is one
     * sent in the past whose window closed before now, not one sent now with a
     * window that closed earlier.
     */
    async function seedSentQuotation(
      requestId: CustomRequestId,
      { sentAt = new Date(), validUntil = new Date(Date.now() + HOUR_MS) } = {},
    ) {
      const quotationId = newId() as QuotationId;
      const versionId = newId() as QuotationVersionId;

      await context.inTransaction(async () => {
        await quotations.createForRequest(quotationId, `QUO-${quotationId}`, requestId);
        await quotations.addVersion({
          id: versionId,
          quotationId,
          quantityTotal: 25,
          subtotalAmount: '1000000.00',
          shippingFeeAmount: '0.00',
          totalAmount: '1000000.00',
          depositPercent: '30.00',
          depositAmount: '300000.00',
          remainingAmount: '700000.00',
          lineItems: [],
        });
        await quotations.send(versionId, validUntil, sentAt);
      });

      return { quotationId, versionId };
    }

    it('accepts the current, sent, unexpired version', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const { versionId } = await seedSentQuotation(requestId);

      const accepted = await context.inTransaction(() =>
        quotations.accept({
          versionId,
          customerId,
          grantId: grant,
          stepUpChallengeId: challengeId,
          acceptedAt: new Date(),
        }),
      );

      expect(accepted.status).toBe('ACCEPTED');
      await expect(quotations.acceptedVersionForRequest(requestId)).resolves.toMatchObject({
        id: versionId,
      });
    });

    it('records the amount the customer actually saw', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const { versionId } = await seedSentQuotation(requestId);

      await context.inTransaction(() =>
        quotations.accept({
          versionId,
          customerId,
          grantId: grant,
          stepUpChallengeId: challengeId,
          acceptedAt: new Date(),
        }),
      );

      const [row] = (
        await context.disposable.client.db.execute<{ accepted_total_amount: string }>(
          sql`select accepted_total_amount from quotation_acceptances where quotation_version_id = ${versionId}`,
        )
      ).rows;
      expect(row?.accepted_total_amount).toBe('1000000.00');
    });

    it('refuses an expired version', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const { versionId } = await seedSentQuotation(requestId, {
        sentAt: new Date(Date.now() - 2 * HOUR_MS),
        validUntil: new Date(Date.now() - HOUR_MS),
      });

      const error = await failureOf(() =>
        context.inTransaction(() =>
          quotations.accept({
            versionId,
            customerId,
            grantId: grant,
            stepUpChallengeId: challengeId,
            acceptedAt: new Date(),
          }),
        ),
      );

      expect(error.code).toBe('QUOTE_VERSION_STALE');
    });

    it('refuses a superseded version, even though it was sent', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const { quotationId, versionId: first } = await seedSentQuotation(requestId);

      // A newer version was issued while the customer was deciding.
      const second = newId() as QuotationVersionId;
      await context.inTransaction(async () => {
        await quotations.addVersion({
          id: second,
          quotationId,
          quantityTotal: 25,
          subtotalAmount: '1200000.00',
          shippingFeeAmount: '0.00',
          totalAmount: '1200000.00',
          depositPercent: '30.00',
          depositAmount: '360000.00',
          remainingAmount: '840000.00',
          lineItems: [],
        });
        await quotations.send(second, new Date(Date.now() + HOUR_MS), new Date());
      });

      const error = await failureOf(() =>
        context.inTransaction(() =>
          quotations.accept({
            versionId: first,
            customerId,
            grantId: grant,
            stepUpChallengeId: challengeId,
            acceptedAt: new Date(),
          }),
        ),
      );

      expect(error.code).toBe('QUOTE_VERSION_STALE');
    });

    it('refuses a draft that was never sent', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const quotationId = newId() as QuotationId;
      const versionId = newId() as QuotationVersionId;
      await context.inTransaction(async () => {
        await quotations.createForRequest(quotationId, `QUO-${quotationId}`, requestId);
        // Whole VND: `ck_quotation_versions__currency_scale` rejects a
        // fractional amount, since VND has no minor unit.
        await quotations.addVersion({
          id: versionId,
          quotationId,
          quantityTotal: 1,
          subtotalAmount: '100000.00',
          shippingFeeAmount: '0.00',
          totalAmount: '100000.00',
          depositPercent: '30.00',
          depositAmount: '30000.00',
          remainingAmount: '70000.00',
          lineItems: [],
        });
      });

      const error = await failureOf(() =>
        context.inTransaction(() =>
          quotations.accept({
            versionId,
            customerId,
            grantId: grant,
            stepUpChallengeId: challengeId,
            acceptedAt: new Date(),
          }),
        ),
      );

      expect(error.code).toBe('QUOTE_VERSION_STALE');
    });

    it('refuses a second acceptance of the same version', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const { versionId } = await seedSentQuotation(requestId);
      await context.inTransaction(() =>
        quotations.accept({
          versionId,
          customerId,
          grantId: grant,
          stepUpChallengeId: challengeId,
          acceptedAt: new Date(),
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          quotations.accept({
            versionId,
            customerId,
            grantId: grant,
            stepUpChallengeId: challengeId,
            acceptedAt: new Date(),
          }),
        ),
      );

      expect(error.code).toBe('QUOTE_VERSION_STALE');
    });

    it('leaves no acceptance evidence behind a refused acceptance', async () => {
      const requestId = await submitRequest();
      const grant = await seedGrant(requestId);
      const { versionId } = await seedSentQuotation(requestId, {
        sentAt: new Date(Date.now() - 2 * HOUR_MS),
        validUntil: new Date(Date.now() - HOUR_MS),
      });

      await expect(
        context.inTransaction(() =>
          quotations.accept({
            versionId,
            customerId,
            grantId: grant,
            stepUpChallengeId: challengeId,
            acceptedAt: new Date(),
          }),
        ),
      ).rejects.toBeDefined();

      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from quotation_acceptances where quotation_version_id = ${versionId}`,
        )
      ).rows;
      expect(Number(row?.count)).toBe(0);
    });
  });
});
