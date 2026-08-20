/**
 * The two `APP6-B01` drafting commands against a real PostgreSQL instance.
 *
 * The properties below are only observable against real rows: that a header and
 * its first version commit **together**, that CST-064 accepts what the pricing
 * layer derived, that a version is an append rather than an edit, and — the
 * negative the whole checkpoint rests on — that drafting leaves the custom
 * request exactly where it was.
 *
 * The use cases are exercised directly rather than over HTTP: the guard
 * composition is a presentation fact proved by the contract suite, while what
 * needs a database here is the transaction boundary. The ADMIN actor is bound
 * the way `AuthenticatedAdminGuard` binds it, so "the operator is server-derived"
 * is exercised rather than bypassed.
 */
import { newId } from '@embroidery/database';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { OrderModule } from '../../../order/order.module';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { AddQuotationVersionUseCase } from '../../application/drafting/add-quotation-version.use-case';
import { CreateQuotationDraftUseCase } from '../../application/drafting/create-quotation-draft.use-case';
import { QuotationVersionDrafter } from '../../application/drafting/quotation-version.drafter';
import type { DraftVersionCommand } from '../../application/drafting/draft-version.command';
import { QUOTATION_CODE_PATTERN } from '../../domain/drafting/quotation-code';
import { isQuotationDraftingError } from '../../domain/drafting/quotation-drafting.errors';
import { QuotationDepositPolicyReader } from '../../infrastructure/policy/quotation-deposit-policy.reader';
import { QuotationModule } from '../../quotation.module';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
} from '../../domain/repositories/quotation.repository';

/** The published `quotation.deposit` shape. Values belong to the dataset. */
const DEPOSIT_POLICY = { depositPercent: 40, remainingPercent: 60 };

describe('APP6-B01 quotation drafting (integration)', () => {
  let context: PersistenceTestContext;
  let create: CreateQuotationDraftUseCase;
  let addVersion: AddQuotationVersionUseCase;
  let requests: CustomRequestRepository;
  let policies: PolicyConfigurationRepository;
  let requestContext: RequestContextService;
  let customerId: string;
  let adminId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('app6-b01-drafting', [
      RequestContextModule,
      OrderModule,
      QuotationModule,
    ]);
    requests = context.get(CUSTOM_REQUEST_REPOSITORY);
    policies = context.get(PolicyConfigurationRepository);
    requestContext = context.get(RequestContextService);

    // The two use cases are constructed from the container's own repositories
    // and transaction manager rather than through `QuotationDraftingModule`:
    // that module also brings the APP1 guards and the configuration they
    // require, and this suite has no HTTP surface for a guard to run on. The
    // collaborators are the real ones, so nothing under test is doubled.
    const transactions: TransactionManager = context.get(TransactionManager);
    const quotations: QuotationRepository = context.get(QUOTATION_REPOSITORY);
    const drafter = new QuotationVersionDrafter(quotations);
    const reader = new QuotationDepositPolicyReader(policies);
    create = new CreateQuotationDraftUseCase(
      transactions,
      quotations,
      requests,
      reader,
      drafter,
      requestContext,
    );
    addVersion = new AddQuotationVersionUseCase(
      transactions,
      quotations,
      reader,
      drafter,
      requestContext,
    );
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    const db = context.disposable.client.db;

    customerId = newId();
    adminId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Quote Customer', now())
    `);
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`admin-${adminId}@example.com`}, 'Admin', 'ACTIVE')
    `);
    await publishDepositPolicy(DEPOSIT_POLICY);
  });

  async function publishDepositPolicy(value: Record<string, unknown>): Promise<void> {
    await context.inTransaction(async () => {
      await policies.ensureKey('quotation.deposit', 'Deposit split for tests.');
      await policies.publishVersion({
        configKey: 'quotation.deposit',
        value,
        valueSchemaVersion: 1,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'test fixture',
      });
    });
  }

  /** Runs work with the ADMIN actor bound exactly as the guard binds it. */
  async function asAdmin<T>(work: () => Promise<T>): Promise<T> {
    return requestContext.run({ requestId: newId() }, async () => {
      requestContext.bindActor({ kind: 'ADMIN', adminId });
      return work();
    });
  }

  async function seedRequest(status = 'UNDER_REVIEW'): Promise<CustomRequestId> {
    const id = newId() as CustomRequestId;
    await context.inTransaction(() =>
      requests.submit({
        id,
        code: `REQ-${id.slice(0, 8)}`,
        customerId,
        breakdown: [{ productVariantId: undefined, sizeLabel: 'M', quantity: 10 }],
      }),
    );
    // `submit` creates the request at NEW. Only its status matters to the
    // eligibility guard under test, and moving it with a raw update keeps this
    // fixture from depending on APP5's transition rules.
    await context.disposable.client.db.execute(sql`
      update custom_requests set status = ${status} where id = ${id}
    `);
    return id;
  }

  function command(overrides: Partial<DraftVersionCommand> = {}): DraftVersionCommand {
    return {
      quantityTotal: 10,
      stitchCount: 8_500,
      shippingFeeAmount: '50000',
      manualAdjustmentAmount: undefined,
      adjustmentReason: undefined,
      lineItems: [
        {
          lineKind: 'PRODUCT',
          description: 'Polo shirt',
          skuId: undefined,
          quantity: 10,
          unitPriceAmount: '150000',
        },
        {
          lineKind: 'DIGITIZING_FEE',
          description: 'Digitizing',
          skuId: undefined,
          quantity: 1,
          unitPriceAmount: '300000',
        },
      ],
      ...overrides,
    };
  }

  async function failureOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      if (isQuotationDraftingError(error)) {
        return error.failure;
      }
      throw error;
    }
    throw new Error('Expected the drafting command to fail, but it succeeded.');
  }

  async function rowCount(table: 'quotations' | 'quotation_versions'): Promise<number> {
    const result = await context.disposable.client.db.execute<{ count: string }>(
      table === 'quotations'
        ? sql`select count(*)::text as count from quotations`
        : sql`select count(*)::text as count from quotation_versions`,
    );
    return Number(result.rows[0]?.count ?? '-1');
  }

  async function requestStatus(id: CustomRequestId): Promise<string> {
    const request = await requests.findById(id);
    return request?.status ?? 'MISSING';
  }

  describe('create — quotation header with its first draft version', () => {
    it('creates one quotation and one DRAFT version, priced from the lines', async () => {
      const requestId = await seedRequest();

      const view = await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      expect(view.quotationCode).toMatch(QUOTATION_CODE_PATTERN);
      expect(view.customRequestId).toBe(requestId);
      expect(view.quotationStatus).toBe('DRAFT');
      expect(view.versionStatus).toBe('DRAFT');
      expect(view.version).toBe(1);
      expect(view.currencyCode).toBe('VND');
      expect(view.lineItemCount).toBe(2);

      // 10 × 150000 + 1 × 300000 = 1800000; + 50000 shipping = 1850000.
      expect(view.subtotalAmount).toBe('1800000.00');
      expect(view.totalAmount).toBe('1850000.00');
      expect(view.depositPercent).toBe('40.00');
      expect(view.depositAmount).toBe('740000.00');
      expect(view.remainingAmount).toBe('1110000.00');

      expect(await rowCount('quotations')).toBe(1);
      expect(await rowCount('quotation_versions')).toBe(1);
    });

    it('persists every amount as a string, exactly as the response reported it', async () => {
      const requestId = await seedRequest();
      const view = await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      const stored = await context.disposable.client.db.execute<Record<string, unknown>>(sql`
        select subtotal_amount, shipping_fee_amount, total_amount,
               deposit_percent, deposit_amount, remaining_amount, currency_code
          from quotation_versions where id = ${view.versionId}
      `);
      const row = stored.rows[0]!;

      // The driver returns `numeric` as a string; nothing on the path converted.
      expect(typeof row['total_amount']).toBe('string');
      expect(row['subtotal_amount']).toBe(view.subtotalAmount);
      expect(row['total_amount']).toBe(view.totalAmount);
      expect(row['deposit_amount']).toBe(view.depositAmount);
      expect(row['remaining_amount']).toBe(view.remainingAmount);
      expect(row['deposit_percent']).toBe(view.depositPercent);
      expect(row['currency_code']).toBe('VND');
    });

    it('writes the line items that explain the subtotal', async () => {
      const requestId = await seedRequest();
      const view = await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      const lines = await context.disposable.client.db.execute<Record<string, unknown>>(sql`
        select position, line_kind, description, quantity, unit_price_amount, line_total_amount
          from quotation_line_items where quotation_version_id = ${view.versionId}
         order by position
      `);

      expect(lines.rows).toHaveLength(2);
      expect(lines.rows[0]?.['line_total_amount']).toBe('1500000.00');
      expect(lines.rows[1]?.['line_total_amount']).toBe('300000.00');
      expect(lines.rows[1]?.['line_kind']).toBe('DIGITIZING_FEE');
    });

    it('leaves the current-version pointer unset — a draft is not a live price', async () => {
      const requestId = await seedRequest();
      const view = await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      const rows = await context.disposable.client.db.execute<{
        current_version_id: string | null;
      }>(sql`select current_version_id from quotations where id = ${view.quotationId}`);
      expect(rows.rows[0]?.current_version_id).toBeNull();
    });

    it('does not project the request to QUOTED, or move it at all', async () => {
      const requestId = await seedRequest();
      await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      expect(await requestStatus(requestId)).toBe('UNDER_REVIEW');

      const transitions = await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from custom_request_transitions where custom_request_id = ${requestId}`,
      );
      expect(transitions.rows[0]?.count).toBe('0');
    });

    it('emits no outbox event — quotation.sent belongs to the send transaction', async () => {
      const requestId = await seedRequest();
      await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      const events = await context.disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from outbox_events`,
      );
      expect(events.rows[0]?.count).toBe('0');
    });

    it('rolls the header back when the version cannot be written', async () => {
      const requestId = await seedRequest();

      // `quantity_total` is CHECK-constrained positive. The header insert has
      // already succeeded when this fails, so a non-atomic implementation
      // leaves a quotation with no version behind.
      await expect(
        asAdmin(() =>
          create.create({ customRequestId: requestId, ...command({ quantityTotal: 0 }) }),
        ),
      ).rejects.toBeDefined();

      expect(await rowCount('quotations')).toBe(0);
      expect(await rowCount('quotation_versions')).toBe(0);
    });

    it('refuses a request that has not reached review', async () => {
      const requestId = await seedRequest('NEW');

      expect(
        await failureOf(() =>
          asAdmin(() => create.create({ customRequestId: requestId, ...command() })),
        ),
      ).toBe('REQUEST_NOT_QUOTABLE');
      expect(await rowCount('quotations')).toBe(0);
    });

    it('refuses a cancelled request', async () => {
      const requestId = await seedRequest('CANCELLED');

      expect(
        await failureOf(() =>
          asAdmin(() => create.create({ customRequestId: requestId, ...command() })),
        ),
      ).toBe('REQUEST_NOT_QUOTABLE');
    });

    it('refuses a request that does not exist', async () => {
      expect(
        await failureOf(() =>
          asAdmin(() =>
            create.create({ customRequestId: newId() as CustomRequestId, ...command() }),
          ),
        ),
      ).toBe('REQUEST_NOT_FOUND');
    });

    it('refuses a second quotation for the same request', async () => {
      const requestId = await seedRequest();
      await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));

      expect(
        await failureOf(() =>
          asAdmin(() => create.create({ customRequestId: requestId, ...command() })),
        ),
      ).toBe('QUOTATION_ALREADY_EXISTS');
      expect(await rowCount('quotations')).toBe(1);
    });

    it('refuses when the deposit policy has not been published, writing nothing', async () => {
      const requestId = await seedRequest();
      // The current-version pointer is a real FK, so it is released before the
      // versions go — the same order the schema would force on any operator.
      await context.disposable.client.db.execute(
        sql`update policy_configurations set current_version_id = null`,
      );
      await context.disposable.client.db.execute(sql`delete from policy_configuration_versions`);
      await context.disposable.client.db.execute(sql`delete from policy_configurations`);

      expect(
        await failureOf(() =>
          asAdmin(() => create.create({ customRequestId: requestId, ...command() })),
        ),
      ).toBe('QUOTATION_POLICY_UNAVAILABLE');
      expect(await rowCount('quotations')).toBe(0);
    });

    it('refuses to price without an operator bound', async () => {
      const requestId = await seedRequest();

      await expect(
        requestContext.run({ requestId: newId() }, () =>
          create.create({ customRequestId: requestId, ...command() }),
        ),
      ).rejects.toBeDefined();
      expect(await rowCount('quotations')).toBe(0);
    });
  });

  describe('add version — TR-LC12-01 as an append', () => {
    async function seedQuotation(): Promise<{
      requestId: CustomRequestId;
      quotationId: QuotationId;
      firstVersionId: string;
    }> {
      const requestId = await seedRequest();
      const view = await asAdmin(() => create.create({ customRequestId: requestId, ...command() }));
      return {
        requestId,
        quotationId: view.quotationId as QuotationId,
        firstVersionId: view.versionId,
      };
    }

    it('creates the next consecutive DRAFT version', async () => {
      const { quotationId } = await seedQuotation();

      const second = await asAdmin(() => addVersion.addVersion({ quotationId, ...command() }));

      expect(second.version).toBe(2);
      expect(second.versionStatus).toBe('DRAFT');
      expect(await rowCount('quotation_versions')).toBe(2);
      expect(await rowCount('quotations')).toBe(1);
    });

    it('leaves the earlier version untouched, including a SENT one', async () => {
      const { quotationId, firstVersionId } = await seedQuotation();
      const db = context.disposable.client.db;

      // Freeze version 1 the way a send would, then re-price.
      await db.execute(sql`
        update quotation_versions
           set status = 'SENT', sent_at = now(), valid_from = now(),
               valid_until = now() + interval '7 days'
         where id = ${firstVersionId}
      `);
      const before = await db.execute<Record<string, unknown>>(
        sql`select status, total_amount, deposit_amount from quotation_versions where id = ${firstVersionId}`,
      );

      const second = await asAdmin(() =>
        addVersion.addVersion({
          quotationId,
          ...command({
            lineItems: [
              {
                lineKind: 'PRODUCT',
                description: 'Re-priced',
                skuId: undefined,
                quantity: 10,
                unitPriceAmount: '200000',
              },
            ],
          }),
        }),
      );

      expect(second.version).toBe(2);
      expect(second.totalAmount).toBe('2050000.00');

      const after = await db.execute<Record<string, unknown>>(
        sql`select status, total_amount, deposit_amount from quotation_versions where id = ${firstVersionId}`,
      );
      // The sent version was neither repriced nor re-stated.
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(after.rows[0]?.['status']).toBe('SENT');
    });

    it('prices the new version under the policy in force when it is drafted', async () => {
      const { quotationId } = await seedQuotation();
      await publishDepositPolicy({ depositPercent: 50, remainingPercent: 50 });

      const second = await asAdmin(() => addVersion.addVersion({ quotationId, ...command() }));

      expect(second.depositPercent).toBe('50.00');
      expect(second.depositAmount).toBe('925000.00');
      expect(second.remainingAmount).toBe('925000.00');
    });

    it('numbers concurrent drafts consecutively rather than colliding', async () => {
      const { quotationId } = await seedQuotation();

      const [a, b] = await Promise.all([
        asAdmin(() => addVersion.addVersion({ quotationId, ...command() })),
        asAdmin(() => addVersion.addVersion({ quotationId, ...command() })),
      ]);

      expect([a.version, b.version].sort()).toEqual([2, 3]);
      expect(await rowCount('quotation_versions')).toBe(3);
    });

    it('does not move the request or advance the current-version pointer', async () => {
      const { requestId, quotationId } = await seedQuotation();
      await asAdmin(() => addVersion.addVersion({ quotationId, ...command() }));

      expect(await requestStatus(requestId)).toBe('UNDER_REVIEW');
      const rows = await context.disposable.client.db.execute<{
        current_version_id: string | null;
      }>(sql`select current_version_id from quotations where id = ${quotationId}`);
      expect(rows.rows[0]?.current_version_id).toBeNull();
    });

    it('refuses a quotation that does not exist', async () => {
      expect(
        await failureOf(() =>
          asAdmin(() =>
            addVersion.addVersion({ quotationId: newId() as QuotationId, ...command() }),
          ),
        ),
      ).toBe('QUOTATION_NOT_FOUND');
    });

    it('refuses a quotation that has reached a terminal state', async () => {
      const { quotationId } = await seedQuotation();
      await context.disposable.client.db.execute(
        sql`update quotations set status = 'REJECTED' where id = ${quotationId}`,
      );

      expect(
        await failureOf(() => asAdmin(() => addVersion.addVersion({ quotationId, ...command() }))),
      ).toBe('QUOTATION_NOT_DRAFTABLE');
      expect(await rowCount('quotation_versions')).toBe(1);
    });

    it('writes no version when the pricing is refused', async () => {
      const { quotationId } = await seedQuotation();

      expect(
        await failureOf(() =>
          asAdmin(() =>
            addVersion.addVersion({ quotationId, ...command({ shippingFeeAmount: '500.50' }) }),
          ),
        ),
      ).toBe('QUOTATION_PRICING_INVALID');
      expect(await rowCount('quotation_versions')).toBe(1);
    });
  });
});
