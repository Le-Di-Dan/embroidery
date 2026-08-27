/**
 * Shared harness for the `APP9-B04` Admin shipping-detail suite.
 *
 * Boots a **real HTTP application with the real `AuthenticatedAdminGuard`** and
 * overrides no guard, on the reason `final-payment-context.ts` records: the
 * checkpoint claims its two routes are protected by APP1's existing guards, and
 * a stubbed guard would only prove the handler runs once something lets it.
 *
 * ### Everything is seeded through a canonical writer
 *
 * The order is created by `OrderRepository.createFromAcceptedQuotation` and
 * walked by `OrderRepository.transition`; the obligations are created by
 * `PaymentObligationRepository.createForOrder`; a `SATISFIED` remaining is
 * produced by the real `openAttempt` → `settleAttempt` → `satisfy` chain rather
 * than by an UPDATE, because `satisfy` is the guard (G-DB7-06 / G-DB7-33) that
 * makes the state legitimate; a `FROZEN` detail is produced by
 * `OrderRepository.dispatch`, the one delivered freeze writer.
 *
 * That last point matters for `APP9-B04` §19 case 6: the frozen state is reached
 * through **repository authority**, never by invoking `APP9-B05`'s HTTP surface,
 * which does not exist. Raw SQL appears only to read committed state back and to
 * revoke a grant's usability in the one case that must prove a refusal.
 *
 * `OrderModule`, `PaymentModule` and `CustomerModule` appear in the testing
 * module for seeding and for the secure-flow capabilities the production write
 * itself uses.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  PolicyConfigurationRepository,
  TransactionManager,
  type AttemptId,
  type ObligationId,
  type PaymentObligationRepository,
} from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { hashToken } from '../../../identity/infrastructure/crypto/session-token.service';
import { AdminOrderShippingModule } from '../../admin-order-shipping.module';
import { OrderModule } from '../../order.module';
import { PaymentModule } from '../../../payment/payment.module';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type {
  OrderId,
  OrderItem,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import { SECURE_GRANT_POLICY_KEY } from '../../../customer/domain/grant/secure-grant-policy';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../../customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../../customer/domain/secret/app4-secret-digest';
import { CustomerShippingFeeModule } from '../../customer-shipping-fee.module';
import { seedOrderChain } from './order-fixture';
import type { OrderFixture } from './order-fixture';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/**
 * The amounts the seeded chain carries, exactly as `order-fixture.ts` stores
 * them. The quoted shipping fee is the baseline every first write is measured
 * against, so it is named here rather than repeated as a literal in the suite.
 */
/**
 * Synthetic peppers, set for the life of the context and restored on close. The
 * fixture stores only `digestSecret(pepper, token)`, so a passing test proves
 * the production peppered lookup rather than a bypass.
 */
const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app9-b04-c1-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app9-b04-c1-secure-link-pepper-0002',
};

export const QUOTED_FEE = '50000.00';
export const DEPOSIT_AMOUNT = '765000.00';
export const REMAINING_AMOUNT = '1785000.00';

export type CountableTable =
  | 'shipping_details'
  | 'shipping_snapshots'
  | 'shipping_fee_acknowledgements'
  | 'payment_obligations'
  | 'payment_attempts'
  | 'payment_reconciliations'
  | 'order_transitions'
  | 'outbox_events';

export interface ObligationRow {
  readonly id: string;
  readonly kind: string;
  readonly amount: string;
  readonly status: string;
  readonly supersededByObligationId: string | null;
  readonly sourceQuotationVersionId: string;
}

export interface ShippingRow {
  readonly recipientName: string;
  readonly addressLine: string;
  readonly ward: string | null;
  readonly province: string;
  readonly feeAmount: string | null;
  readonly carrierName: string | null;
  readonly status: string;
  readonly frozenAt: string | null;
}

export interface AcknowledgementRow {
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly grantId: string;
  readonly stepUpChallengeId: string;
}

export interface ReconciliationRow {
  readonly action: string;
  readonly amount: string | null;
  readonly resolvedStatus: string | null;
  readonly paymentObligationId: string | null;
}

export interface SeededOrder {
  readonly orderId: string;
  readonly code: string;
  readonly fixture: OrderFixture;
}

export interface SeedOrderOptions {
  /** The LC-14 state to walk the order to. Defaults to `PRODUCTION_COMPLETED`. */
  readonly status?: OrderState;
  /** Settles the REMAINING obligation through the canonical chain. */
  readonly satisfyRemaining?: boolean;
}

export interface ShippingDetailTestContext {
  readonly app: INestApplication;
  readonly disposable: DisposableDatabase;
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  seedOrder(options?: SeedOrderOptions): Promise<SeededOrder>;
  /** Saves a detail through the canonical repository, outside the HTTP surface. */
  saveDetail(orderId: string, feeAmount: string | undefined): Promise<void>;
  /** Freezes through `OrderRepository.dispatch` — the one delivered freeze writer. */
  freeze(orderId: string): Promise<void>;
  /** Revokes every grant on a request, so no acknowledgement evidence stands. */
  revokeGrants(customRequestId: string): Promise<void>;
  /**
   * Mints a secure-link token for the fixture's existing `REQUEST_ACCESS` grant.
   *
   * The grant row is the one `order-fixture.ts` seeded; only its `token_hash`
   * is replaced, with the real peppered digest. No new grant, no new scope.
   */
  linkToken(customRequestId: string): Promise<string>;
  /** Ages every STEP_UP challenge past the published window, without deleting it. */
  expireStepUp(): Promise<void>;
  shippingOf(orderId: string): Promise<ShippingRow | undefined>;
  obligationsOf(orderId: string): Promise<ObligationRow[]>;
  acknowledgementsOf(orderId: string): Promise<AcknowledgementRow[]>;
  reconciliationsOf(): Promise<ReconciliationRow[]>;
  orderStatus(orderId: string): Promise<string>;
  countRows(table: CountableTable): Promise<number>;
  close(): Promise<void>;
}

export async function createShippingDetailContext(
  label: string,
): Promise<ShippingDetailTestContext> {
  const previous = { url: process.env['DATABASE_URL'], env: process.env['NODE_ENV'] };

  const disposable = await createDisposableDatabase(label);
  const previousPeppers = Object.fromEntries(
    Object.keys(TEST_PEPPERS).map((name) => [name, process.env[name]]),
  );
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    process.env[name] = value;
  }

  let app: INestApplication;
  let orders: OrderRepository;
  let obligations: PaymentObligationRepository;
  let transactions: TransactionManager;
  let policies: PolicyConfigurationRepository;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        AdminOrderShippingModule,
        // The customer half of the same fee change (`APP9-B04-C1`).
        CustomerShippingFeeModule,
        // Seeding only — see the file header.
        OrderModule,
        PaymentModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
    orders = moduleRef.get<OrderRepository>(ORDER_REPOSITORY);
    obligations = moduleRef.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
    transactions = moduleRef.get(TransactionManager);
    policies = moduleRef.get(PolicyConfigurationRepository);
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  let currentCookie = '';

  const seedAdminSession = async (): Promise<string> => {
    const existing = (
      await db.execute<{ id: string }>(
        sql`select id from admin_accounts where status = 'ACTIVE' limit 1`,
      )
    ).rows[0];

    let adminId = existing?.id;
    if (adminId === undefined) {
      adminId = newId();
      await db.execute(sql`
        insert into admin_accounts (id, email, display_name, status)
        values (${adminId}, ${`b04-${adminId}@example.test`}, 'B04 Operator', 'ACTIVE')
      `);
    }
    // The published `secure_grant` policy the production `StepUpEvidenceResolver`
    // reads fail-closed. Seeded here rather than defaulted in the resolver: the
    // step-up window is the period in which one OTP can authorise money, and a
    // constant in application code would be a second, unversioned source of it.
    await transactions.runInTransaction(async () => {
      // The public admission reads this one fail-closed before any transaction.
      await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP9-B04 suite fixture.');
      await policies.publishVersion({
        configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
        value: { maxRequestsPerIpPerMinute: 600 },
        valueSchemaVersion: 1,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        createdByAdminId: adminId,
        reason: 'APP9-B04 suite fixture.',
      });
      await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'APP9-B04 suite fixture.');
      await policies.publishVersion({
        configKey: SECURE_GRANT_POLICY_KEY,
        value: { standardTtlSeconds: 7 * 24 * 60 * 60, stepUpWindowSeconds: 15 * 60 },
        valueSchemaVersion: 1,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        createdByAdminId: adminId,
        reason: 'APP9-B04 suite fixture.',
      });
    });

    const rawToken = randomBytes(32).toString('base64url');
    await db.execute(sql`
      insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
      values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE',
              ${new Date(Date.now() + 30 * 60 * 1_000)})
    `);
    currentCookie = `${ADMIN_COOKIE_NAME}=${rawToken}`;
    return currentCookie;
  };

  const catalogItem = (fixture: OrderFixture): OrderItem => ({
    position: 1,
    skuId: fixture.skuId,
    customerOwnedProductId: undefined,
    productName: 'Tee',
    variantLabel: 'Black / M',
    sizeLabel: undefined,
    quantity: 25,
    unitPriceAmount: '100000.00',
    lineTotalAmount: '2500000.00',
  });

  const PATH_TO: Readonly<Partial<Record<OrderState, readonly OrderState[]>>> = {
    PRODUCTION_COMPLETED: ['DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED'],
    AWAITING_FINAL_PAYMENT: [
      'DEPOSIT_PAID',
      'IN_PRODUCTION',
      'PRODUCTION_COMPLETED',
      'AWAITING_FINAL_PAYMENT',
    ],
    READY_FOR_DELIVERY: [
      'DEPOSIT_PAID',
      'IN_PRODUCTION',
      'PRODUCTION_COMPLETED',
      'AWAITING_FINAL_PAYMENT',
      'READY_FOR_DELIVERY',
    ],
  };

  const seedOrder: ShippingDetailTestContext['seedOrder'] = async (options = {}) => {
    const fixture = await seedOrderChain({ disposable }, newId().slice(0, 8));
    const orderId = newId() as OrderId;
    const code = `ORD-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;

    await transactions.runInTransaction(() =>
      orders.createFromAcceptedQuotation({
        id: orderId,
        code,
        customRequestId: fixture.customRequestId,
        acceptedQuotationVersionId: fixture.quotationVersionId,
        approvalSnapshotId: fixture.approvalSnapshotId,
        items: [catalogItem(fixture)],
      }),
    );

    let remainingId: ObligationId | undefined;
    await transactions.runInTransaction(async () => {
      await obligations.createForOrder({
        id: newId() as ObligationId,
        orderId,
        kind: 'DEPOSIT',
        amount: DEPOSIT_AMOUNT,
        sourceQuotationVersionId: fixture.quotationVersionId,
      });
      const remaining = await obligations.createForOrder({
        id: newId() as ObligationId,
        orderId,
        kind: 'REMAINING',
        amount: REMAINING_AMOUNT,
        sourceQuotationVersionId: fixture.quotationVersionId,
      });
      remainingId = remaining.id;
    });

    for (const to of PATH_TO[options.status ?? 'PRODUCTION_COMPLETED'] ?? []) {
      await transactions.runInTransaction(() =>
        orders.transition({
          id: orderId,
          to,
          actor: { kind: 'SYSTEM', systemJobKey: 'test.seed' },
          correlationId: newId(),
        }),
      );
    }

    if (options.satisfyRemaining === true && remainingId !== undefined) {
      // The real chain, not an UPDATE: `satisfy` is the guard that makes a
      // SATISFIED obligation legitimate, so borrowing it is what stops the case
      // proving a refusal against a state no writer could have produced.
      const target = remainingId;
      await transactions.runInTransaction(async () => {
        const attemptId = newId() as AttemptId;
        await obligations.openAttempt({
          id: attemptId,
          paymentObligationId: target,
          amount: REMAINING_AMOUNT,
          method: 'BANK_TRANSFER',
        });
        await obligations.settleAttempt(attemptId, 'SUCCEEDED', new Date());
        await obligations.satisfy(target, attemptId, new Date());
      });
    }

    return { orderId, code, fixture };
  };

  return {
    app,
    disposable,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => currentCookie,
    reset: async () => {
      await truncateAllTables(db);
      currentCookie = '';
    },
    seedAdminSession,
    seedOrder,
    saveDetail: async (orderId, feeAmount) => {
      await transactions.runInTransaction(() =>
        orders.saveShippingDetails({
          orderId: orderId as OrderId,
          recipientName: 'Seeded Recipient',
          recipientPhone: '0900000000',
          addressLine: '1 Seed Street',
          province: 'Hà Nội',
          feeAmount,
        }),
      );
    },
    freeze: async (orderId) => {
      await transactions.runInTransaction(() =>
        orders.dispatch(orderId as OrderId, new Date(), newId()),
      );
    },
    revokeGrants: async (customRequestId) => {
      await db.execute(sql`
        update secure_access_grants
           set status = 'REVOKED', revoked_at = now(), revoke_reason = 'Test refusal case.'
         where custom_request_id = ${customRequestId}
      `);
    },
    linkToken: async (customRequestId) => {
      const token = randomBytes(32).toString('base64url');
      await db.execute(sql`
        update secure_access_grants
           set token_hash = ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)}
         where custom_request_id = ${customRequestId} and scope_kind = 'REQUEST_ACCESS'
      `);
      return token;
    },
    expireStepUp: async () => {
      // Aged, not deleted: the challenge is still VERIFIED and still the
      // customer's, so the refusal proves the published window, not a gap.
      await db.execute(sql`
        update contact_verification_challenges
           set verified_at = now() - interval '2 hours'
         where purpose = 'STEP_UP'
      `);
    },
    shippingOf: async (orderId) => {
      const [row] = (
        await db.execute<{
          recipient_name: string;
          address_line: string;
          ward: string | null;
          province: string;
          fee_amount: string | null;
          carrier_name: string | null;
          status: string;
          frozen_at: string | null;
        }>(sql`
          select recipient_name, address_line, ward, province, fee_amount::text as fee_amount,
                 carrier_name, status, frozen_at::text as frozen_at
            from shipping_details
           where order_id = ${orderId}
        `)
      ).rows;
      return row === undefined
        ? undefined
        : {
            recipientName: row.recipient_name,
            addressLine: row.address_line,
            ward: row.ward,
            province: row.province,
            feeAmount: row.fee_amount,
            carrierName: row.carrier_name,
            status: row.status,
            frozenAt: row.frozen_at,
          };
    },
    obligationsOf: async (orderId) => {
      const rows = (
        await db.execute<{
          id: string;
          kind: string;
          amount: string;
          status: string;
          superseded_by_obligation_id: string | null;
          source_quotation_version_id: string;
        }>(sql`
          select id, kind, amount::text as amount, status, superseded_by_obligation_id,
                 source_quotation_version_id
            from payment_obligations
           where order_id = ${orderId}
           order by kind, created_at, id
        `)
      ).rows;
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: row.amount,
        status: row.status,
        supersededByObligationId: row.superseded_by_obligation_id,
        sourceQuotationVersionId: row.source_quotation_version_id,
      }));
    },
    acknowledgementsOf: async (orderId) => {
      const rows = (
        await db.execute<{
          previous_fee_amount: string;
          new_fee_amount: string;
          currency_code: string;
          grant_id: string;
          step_up_challenge_id: string;
        }>(sql`
          select previous_fee_amount::text as previous_fee_amount,
                 new_fee_amount::text as new_fee_amount,
                 currency_code, grant_id, step_up_challenge_id
            from shipping_fee_acknowledgements
           where order_id = ${orderId}
           order by id
        `)
      ).rows;
      return rows.map((row) => ({
        previousFeeAmount: row.previous_fee_amount,
        newFeeAmount: row.new_fee_amount,
        currencyCode: row.currency_code,
        grantId: row.grant_id,
        stepUpChallengeId: row.step_up_challenge_id,
      }));
    },
    reconciliationsOf: async () => {
      const rows = (
        await db.execute<{
          action: string;
          amount: string | null;
          resolved_status: string | null;
          payment_obligation_id: string | null;
        }>(sql`
          select action, amount::text as amount, resolved_status, payment_obligation_id
            from payment_reconciliations
           order by id
        `)
      ).rows;
      return rows.map((row) => ({
        action: row.action,
        amount: row.amount,
        resolvedStatus: row.resolved_status,
        paymentObligationId: row.payment_obligation_id,
      }));
    },
    orderStatus: async (orderId) => {
      const [row] = (
        await db.execute<{ status: string }>(sql`select status from orders where id = ${orderId}`)
      ).rows;
      return row?.status ?? 'MISSING';
    },
    countRows: async (table) => {
      // `sql.raw` on a value from a closed union, never from a test's input.
      const [row] = (
        await db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${sql.raw(table)}`,
        )
      ).rows;
      return Number(row?.count ?? '0');
    },
    close: async () => {
      await app.close();
      await disposable.drop();
      restore('DATABASE_URL', previous.url);
      restore('NODE_ENV', previous.env);
      for (const [name, value] of Object.entries(previousPeppers)) {
        restore(name, value);
      }
    },
  };
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

/** The envelope's `data`, typed. Narrowed here, at one boundary. */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The envelope's error `code`, narrowed at the same one boundary. */
export function errorCodeOf(response: { readonly body: unknown }): string {
  return (response.body as { readonly code?: string }).code ?? '';
}

/** The one canonical route, under the global API prefix. */
export const SHIPPING_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/shipping-detail`;

/** A complete, valid body. Cases override only the field they are about. */
export function shippingBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recipientName: 'Nguyễn Thị Mai',
    recipientPhone: '0901234567',
    addressLine: '12 Nguyễn Huệ',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
    feeAmount: QUOTED_FEE,
    ...overrides,
  };
}

/** The customer acknowledgement route, under the same global API prefix. */
export const ACKNOWLEDGEMENT_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/orders/shipping-fee-acknowledgements`;
