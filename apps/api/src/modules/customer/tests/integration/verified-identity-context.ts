/**
 * Shared setup for the `APP4-B02` verified-identity suites.
 *
 * Boots the real `CustomerModule` — real repository, real `TransactionManager`,
 * real audit writer — against a disposable database with every migration
 * applied, and binds a request context, because the audit recorder correlates by
 * request id and refuses to invent one.
 *
 * The two global platform modules are listed explicitly: they are `@Global()` in
 * production and reach every module through `AppModule`, so a test module that
 * imported only `CustomerModule` would fail to resolve the recorder's context
 * dependencies for a reason production never has.
 *
 * Evidence is built through the `APP4-P01` normalizers, never by hand. A fixture
 * that assembled a `NormalizedContact` literal would be asserting against its own
 * idea of canonical form rather than against the one the production path uses.
 *
 * Test-only.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { CustomerModule } from '../../customer.module';
import { normalizeEmail } from '../../domain/contact/normalize-email';
import { normalizePhone } from '../../domain/contact/normalize-phone';
import type { VerifiedContactEvidence } from '../../domain/identity/verified-contact-evidence';
import { ResolveOrCreateVerifiedCustomer } from '../../application/resolve-or-create-verified-customer.service';
import type { CustomerId } from '../../domain/repositories/customer.repository';

/** The bounded evidence reference the delivered fixtures already use. */
export const OTP_SOURCE = 'OTP';

export interface VerifiedIdentityContext extends PersistenceTestContext {
  readonly service: ResolveOrCreateVerifiedCustomer;
  /** Runs `work` with a request context bound, as an HTTP request would. */
  inRequest<T>(work: () => Promise<T>): Promise<T>;
  readonly requestId: string;
}

export async function createVerifiedIdentityContext(
  label: string,
): Promise<VerifiedIdentityContext> {
  const base = await createPersistenceTestContext(label, [
    RequestContextModule,
    AuditContextModule,
    CustomerModule,
  ]);
  const requestContext = base.get<RequestContextService>(RequestContextService);
  const requestId = `b02-${newId()}`;

  return {
    ...base,
    service: base.get<ResolveOrCreateVerifiedCustomer>(ResolveOrCreateVerifiedCustomer),
    requestId,
    inRequest: <T>(work: () => Promise<T>): Promise<T> => requestContext.run({ requestId }, work),
  };
}

/** Synthetic email evidence, normalized by the P01 authority. */
export function emailEvidence(raw: string, verifiedSource = OTP_SOURCE): VerifiedContactEvidence {
  const result = normalizeEmail(raw);
  if (!result.ok) {
    throw new Error(`Fixture email is not normalizable: ${result.reason}`);
  }
  return { contact: result.contact, verifiedAt: new Date(), verifiedSource };
}

/** Synthetic phone evidence, normalized by the P01 authority. */
export function phoneEvidence(raw: string): VerifiedContactEvidence {
  const result = normalizePhone(raw);
  if (!result.ok) {
    throw new Error(`Fixture phone is not normalizable: ${result.reason}`);
  }
  return { contact: result.contact, verifiedAt: new Date(), verifiedSource: OTP_SOURCE };
}

export interface ContactRowFixture {
  readonly customerId: CustomerId;
  readonly contactKind: 'EMAIL' | 'PHONE';
  readonly normalizedValue: string;
  readonly displayValue?: string;
  readonly isPrimary?: boolean;
  /** Omit to seed an **unverified** row — the case that must never link. */
  readonly verifiedAt?: Date | undefined;
  readonly deactivatedAt?: Date | undefined;
}

/**
 * Seeds a customer row directly.
 *
 * Raw SQL on purpose: the states these suites need to observe — an unverified
 * contact, a deactivated one, a merge tombstone — are states the production
 * path is forbidden to create, so they cannot be arranged through the service
 * under test.
 */
export async function seedCustomer(
  context: VerifiedIdentityContext,
  options: { mergedInto?: CustomerId } = {},
): Promise<CustomerId> {
  const id = newId() as CustomerId;
  await context.disposable.client.db.execute(sql`
    insert into customers (id, display_name, verified_at, merged_into_customer_id)
    values (${id}, 'Fixture Customer', now(), ${options.mergedInto ?? null})
  `);
  return id;
}

export async function seedContact(
  context: VerifiedIdentityContext,
  fixture: ContactRowFixture,
): Promise<string> {
  const id = newId();
  await context.disposable.client.db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source, deactivated_at)
    values (
      ${id}, ${fixture.customerId}, ${fixture.contactKind}, ${fixture.normalizedValue},
      ${fixture.displayValue ?? fixture.normalizedValue}, ${fixture.isPrimary ?? false},
      ${fixture.verifiedAt ?? null},
      ${fixture.verifiedAt === undefined ? null : OTP_SOURCE},
      ${fixture.deactivatedAt ?? null}
    )
  `);
  return id;
}
