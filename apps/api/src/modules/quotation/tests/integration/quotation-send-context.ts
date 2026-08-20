/**
 * Shared harness for the `APP6-B03` send suites.
 *
 * One disposable database, the real AGG-13 and AGG-14 repositories, the real
 * audit repository, the real outbox store and the real transaction manager. The
 * use case is constructed from the container's own collaborators rather than
 * through `QuotationSendModule`, for the reason `APP6-B01`'s suite records: that
 * module also brings the APP1 guards and the configuration they require, and
 * these suites have no HTTP surface for a guard to run on. Nothing under test is
 * doubled — the only substitution any suite makes is an explicit failure
 * injection, and it is passed in.
 *
 * The ADMIN actor is bound the way `AuthenticatedAdminGuard` binds it, so "the
 * operator is server-derived" is exercised rather than bypassed.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import {
  OutboxEventStore,
  PolicyConfigurationRepository,
  TransactionManager,
} from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { AuditModule } from '../../../audit/audit.module';
import { AUDIT_EVENT_REPOSITORY } from '../../../audit/domain/repositories/audit-event.repository';
import type { AuditEventRepository } from '../../../audit/domain/repositories/audit-event.repository';
import { OrderModule } from '../../../order/order.module';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { QuotationSendRecorder } from '../../application/sending/quotation-send.recorder';
import { SendQuotationVersionUseCase } from '../../application/sending/send-quotation-version.use-case';
import { isQuotationSendError } from '../../domain/sending/quotation-send.errors';
import { QuotationValidityPolicyReader } from '../../infrastructure/policy/quotation-validity-policy.reader';
import { QuotationModule } from '../../quotation.module';
import {
  QUOTATION_REPOSITORY,
  type AddQuotationVersionInput,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

/** The published `quotation.validity` shape. The value belongs to the dataset. */
export const VALIDITY_POLICY_KEY = 'quotation.validity';

export interface SendTestContext {
  readonly context: PersistenceTestContext;
  readonly quotations: QuotationRepository;
  readonly requests: CustomRequestRepository;
  adminId(): string;
  /** The production use case, on the real collaborators. */
  sender(): SendQuotationVersionUseCase;
  /** The same use case with one collaborator replaced, for failure injection. */
  senderWith(outbox: OutboxEventStore): SendQuotationVersionUseCase;
  outbox(): OutboxEventStore;
  asAdmin<T>(work: () => Promise<T>): Promise<T>;
  publishValidity(value: unknown): Promise<void>;
  clearValidity(): Promise<void>;
  seedRequest(status?: string): Promise<CustomRequestId>;
  seedQuotation(requestId: CustomRequestId): Promise<QuotationId>;
  addDraft(quotationId: QuotationId, unitPrice: number): Promise<QuotationVersionId>;
  rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
  count(query: ReturnType<typeof sql>): Promise<number>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createSendTestContext(label: string): Promise<SendTestContext> {
  const context = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditModule,
    OrderModule,
    QuotationModule,
  ]);

  const transactions: TransactionManager = context.get(TransactionManager);
  const quotations: QuotationRepository = context.get(QUOTATION_REPOSITORY);
  const requests: CustomRequestRepository = context.get(CUSTOM_REQUEST_REPOSITORY);
  const policies: PolicyConfigurationRepository = context.get(PolicyConfigurationRepository);
  const auditEvents: AuditEventRepository = context.get(AUDIT_EVENT_REPOSITORY);
  const outboxStore: OutboxEventStore = context.get(OutboxEventStore);
  const requestContext: RequestContextService = context.get(RequestContextService);
  const clock = new AuditClock();
  const validity = new QuotationValidityPolicyReader(policies);
  const db = context.disposable.client.db;

  let adminId = '';

  const build = (outbox: OutboxEventStore): SendQuotationVersionUseCase =>
    new SendQuotationVersionUseCase(
      transactions,
      quotations,
      requests,
      validity,
      new QuotationSendRecorder(auditEvents, outbox, requestContext),
      requestContext,
      clock,
    );

  return {
    context,
    quotations,
    requests,
    adminId: () => adminId,
    sender: () => build(outboxStore),
    senderWith: (outbox) => build(outbox),
    outbox: () => outboxStore,

    /** Runs work with the ADMIN actor bound exactly as the guard binds it. */
    asAdmin: async <T>(work: () => Promise<T>): Promise<T> =>
      requestContext.run({ requestId: newId() }, async () => {
        requestContext.bindActor({ kind: 'ADMIN', adminId });
        return work();
      }),

    publishValidity: async (value: unknown): Promise<void> => {
      await context.inTransaction(async () => {
        await policies.ensureKey(VALIDITY_POLICY_KEY, 'Quotation validity for tests.');
        await policies.publishVersion({
          configKey: VALIDITY_POLICY_KEY,
          value: value as Record<string, unknown>,
          valueSchemaVersion: 1,
          effectiveFrom: new Date(),
          createdByAdminId: adminId,
          reason: 'test fixture',
        });
      });
    },

    /**
     * Removes the published window entirely, so the reader finds nothing.
     *
     * The pointer is cleared first: `fk_policy_configurations__current_version_id`
     * makes the config row depend on the version it points at, so deleting the
     * versions while the pointer still names one is refused.
     */
    clearValidity: async (): Promise<void> => {
      await db.execute(sql`update policy_configurations set current_version_id = null`);
      await db.execute(sql`delete from policy_configuration_versions`);
      await db.execute(sql`delete from policy_configurations`);
    },

    seedRequest: async (status = 'UNDER_REVIEW'): Promise<CustomRequestId> => {
      const id = newId() as CustomRequestId;
      const customerId = await currentCustomer();
      await context.inTransaction(() =>
        requests.submit({
          id,
          // Random rather than derived from the id: `newId()` is UUIDv7, so two
          // rows minted in the same millisecond share their leading characters
          // and a derived code collides on `uq_custom_requests__code`.
          code: `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`,
          customerId,
          breakdown: [{ productVariantId: undefined, sizeLabel: 'M', quantity: 10 }],
        }),
      );
      // `submit` creates the request at NEW. Only its status matters to the
      // eligibility guard under test, and moving it with a raw update keeps this
      // fixture from depending on APP5's transition rules — which is also what
      // lets a suite place a request in a state LC-11 cannot legally reach from
      // NEW in one move.
      await db.execute(sql`update custom_requests set status = ${status} where id = ${id}`);
      return id;
    },

    seedQuotation: async (requestId: CustomRequestId): Promise<QuotationId> => {
      const id = newId() as QuotationId;
      await context.inTransaction(() =>
        quotations.createForRequest(
          id,
          `QUO-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`,
          requestId,
        ),
      );
      return id;
    },

    /**
     * One priced DRAFT version, distinct from every other by construction: the
     * caller chooses the unit price, so no two versions in a fixture share
     * amounts and an assertion cannot pass by reading the wrong row.
     */
    addDraft: async (quotationId: QuotationId, unitPrice: number): Promise<QuotationVersionId> => {
      const version = await context.inTransaction(() =>
        quotations.addVersion(draftInput(quotationId, unitPrice)),
      );
      return version.id;
    },

    rows: async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> =>
      (await db.execute(query)).rows as T[],

    count: async (query: ReturnType<typeof sql>): Promise<number> => {
      const [row] = (await db.execute<{ count: string }>(query)).rows;
      return Number(row?.count ?? -1);
    },

    reset: async (): Promise<void> => {
      await context.reset();
      adminId = newId();
      await db.execute(sql`
        insert into admin_accounts (id, email, display_name, status)
        values (${adminId}, ${`b03-${adminId}@example.test`}, 'B03 Operator', 'ACTIVE')
      `);
    },

    close: () => context.close(),
  };

  async function currentCustomer(): Promise<string> {
    const [existing] = (await db.execute<{ id: string }>(sql`select id from customers limit 1`))
      .rows;
    if (existing !== undefined) {
      return existing.id;
    }
    const customerId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Quote Customer', now())
    `);
    return customerId;
  }
}

/**
 * The priced input one DRAFT version is built from.
 *
 * Exact strings throughout, and the arithmetic CST-064 checks is done here in
 * whole đồng so the fixture cannot smuggle a fractional amount past the column.
 */
export function draftInput(quotationId: QuotationId, unitPrice: number): AddQuotationVersionInput {
  const subtotal = unitPrice * 10;
  const shipping = 50_000;
  const total = subtotal + shipping;
  const deposit = Math.round(total * 0.4);
  return {
    id: newId() as QuotationVersionId,
    quotationId,
    quantityTotal: 10,
    subtotalAmount: `${subtotal}.00`,
    shippingFeeAmount: `${shipping}.00`,
    totalAmount: `${total}.00`,
    depositPercent: '40.00',
    depositAmount: `${deposit}.00`,
    remainingAmount: `${total - deposit}.00`,
    stitchCount: 8_500,
    lineItems: [
      {
        position: 1,
        lineKind: 'PRODUCT',
        description: 'Polo shirt',
        skuId: undefined,
        quantity: 10,
        unitPriceAmount: `${unitPrice}.00`,
        lineTotalAmount: `${subtotal}.00`,
      },
    ],
  };
}

/** The failure name a refused send reported, or a thrown error if it succeeded. */
export async function failureOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error: unknown) {
    if (isQuotationSendError(error)) {
      return error.failure;
    }
    throw error;
  }
  throw new Error('Expected the send to fail, but it succeeded.');
}
