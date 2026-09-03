/**
 * Shared harness for the `APP4-B05` secure-grant suites.
 *
 * Built on the delivered `APP4-B03` fixture rather than beside it, for the
 * reason `verification-attempt-context.ts` records: the checkpoints share a
 * module, a transaction manager and a notification seam, and a second boot with
 * a slightly different clock is how two suites start proving things about two
 * different systems. This adds the `secure_grant` policy, the B05 capabilities
 * resolved from that same container, and a scripted token minter.
 *
 * ### The Custom Request is fixture scaffolding — not an APP5 submission
 *
 * `secure_access_grants.custom_request_id` is NOT NULL with an FK RESTRICT, so a
 * grant cannot exist without a `custom_requests` row. APP5 is not implemented,
 * and `APP4-B05` deliberately does not create requests: production issuance
 * receives an id from an authorized APP5 caller. So the row below is seeded with
 * raw SQL — the minimum a grant needs to bind to — and it stands in for that
 * caller's row. It is **fixture scaffolding, not an APP5 submission**, and
 * nothing in the production path can create one.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { OrderAccessGrantIssuer } from '../../application/order-access-grant.issuer';
import { SecureGrantIssuer } from '../../application/secure-grant.issuer';
import { StepUpWindow } from '../../application/step-up-window.service';
import { SECURE_GRANT_POLICY_KEY } from '../../domain/grant/secure-grant-policy';
import type { CustomerId } from '../../domain/repositories/customer.repository';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
} from '../../domain/repositories/secure-access-grant.repository';
import { SecureLinkTokenMinter } from '../../infrastructure/crypto/secure-link-token.minter';
import {
  CHALLENGE_POLICY,
  createVerificationContext,
  type VerificationTestContext,
} from './verification-issue-context';

/** The `APP4-G01` values, as published. Restated by no production file. */
export const GRANT_POLICY = { standardTtlSeconds: 604_800, stepUpWindowSeconds: 900 };

/**
 * A minter that hands out a known sequence.
 *
 * Well-formed in P01's terms — 43 base64url characters — so nothing downstream
 * behaves differently, but predictable, so a suite can assert which token
 * reached the digest column and then prove that same string appears in no
 * persisted value. Reading a token out of the ciphertext instead would prove the
 * envelope round-trips, not that the *issued* token is the delivered one.
 */
export class ScriptedTokenMinter extends SecureLinkTokenMinter {
  private issued = 0;
  readonly minted: string[] = [];

  override mint(): string {
    this.issued += 1;
    const token = `tok${String(this.issued).padStart(3, '0')}`.padEnd(43, 'x');
    this.minted.push(token);
    return token;
  }

  reset(): void {
    this.issued = 0;
    this.minted.length = 0;
  }

  get last(): string {
    return this.minted[this.minted.length - 1] ?? '';
  }
}

/** One verified customer, one request and one order its grants may bind to. */
export interface GrantFixture {
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  /**
   * A `READY_MADE` order, for the second grant scope (`APP12-DB01`).
   *
   * Fixture scaffolding in the same sense as the Custom Request beside it:
   * `secure_access_grants.order_id` carries a real FK, so an `ORDER_ACCESS`
   * grant cannot exist without a row to point at, and this module does not and
   * must not create orders.
   */
  readonly orderId: string;
  readonly contactPointId: string;
  readonly normalizedValue: string;
}

export interface GrantTestContext extends VerificationTestContext {
  readonly grants: SecureGrantIssuer;
  /** The `ORDER_ACCESS` sibling (`APP12-B04`), resolved from the same container. */
  readonly orderGrants: OrderAccessGrantIssuer;
  readonly stepUp: StepUpWindow;
  readonly repository: SecureAccessGrantRepository;
  readonly tokens: ScriptedTokenMinter;
  /** Seeds a verified customer plus its fixture-scaffolding Custom Request. */
  seedTarget(suffix?: string): Promise<GrantFixture>;
  /** Publishes a `secure_grant` value, replacing whatever is current. */
  publishGrantPolicy(value: Record<string, unknown>): Promise<void>;
}

export interface GrantStartOptions {
  readonly label: string;
  /** Omit to exercise the unpublished-policy path. */
  readonly grantPolicy?: Record<string, unknown> | undefined;
}

export async function createGrantContext(options: GrantStartOptions): Promise<GrantTestContext> {
  const tokens = new ScriptedTokenMinter();
  const base = await createVerificationContext({
    label: options.label,
    policy: CHALLENGE_POLICY,
    configure: (builder) => builder.overrideProvider(SecureLinkTokenMinter).useValue(tokens),
  });

  const publishGrantPolicy = (value: Record<string, unknown>): Promise<void> =>
    base.publishPolicyFor(SECURE_GRANT_POLICY_KEY, value, 'Secure grant policy (APP4-G01).');

  if (options.grantPolicy !== undefined) {
    await publishGrantPolicy(options.grantPolicy);
  }

  return {
    ...base,
    grants: base.get<SecureGrantIssuer>(SecureGrantIssuer),
    orderGrants: base.get<OrderAccessGrantIssuer>(OrderAccessGrantIssuer),
    stepUp: base.get<StepUpWindow>(StepUpWindow),
    repository: base.get<SecureAccessGrantRepository>(SECURE_ACCESS_GRANT_REPOSITORY),
    tokens,
    publishGrantPolicy,
    seedTarget: (suffix = '1'): Promise<GrantFixture> => seedTarget(base, suffix),
  };
}

/**
 * A verified customer, its primary contact, and one Custom Request.
 *
 * Raw SQL, exactly as the DB7 `order-fixture` seeds its own chain: the customer
 * half could go through `ResolveOrCreateVerifiedCustomer`, but the request half
 * has no API in this phase at all, and building one row through a service while
 * its sibling is inserted directly would read as though the request had a
 * production creator.
 */
async function seedTarget(context: VerificationTestContext, suffix: string): Promise<GrantFixture> {
  const db = context.disposable.client.db;
  const customerId = newId();
  const contactPointId = newId();
  const customRequestId = newId();
  const orderId = newId();
  const normalizedValue = `grant-${customerId}@example.com`;

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${`Grant Customer ${suffix}`}, now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactPointId}, ${customerId}, 'EMAIL', ${normalizedValue}, ${normalizedValue},
            true, now(), 'OTP')
  `);
  // Fixture scaffolding — not an APP5 submission. See the file header.
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'NEW')
  `);
  // Fixture scaffolding — not an `APP12-B02` purchase. The Ready-Made creation
  // command reserves stock, freezes a line and issues the grant itself; what an
  // `ORDER_ACCESS` grant needs from it is one row with a real id, and building
  // the rest through raw SQL would read as though this were a real order.
  await db.execute(sql`
    insert into orders (id, code, origin, customer_id, status, total_amount, currency_code)
    values (${orderId}, ${`ORD-${orderId}`}, 'READY_MADE', ${customerId},
            'AWAITING_SHIPPING_FEE', '0.00', 'VND')
  `);

  return {
    customerId: customerId as CustomerId,
    customRequestId,
    orderId,
    contactPointId,
    normalizedValue,
  };
}
