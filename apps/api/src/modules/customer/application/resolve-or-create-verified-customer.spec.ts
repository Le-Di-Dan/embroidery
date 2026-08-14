/**
 * The conflict guard's discrimination (`APP4-B02` §10.2).
 *
 * CST-005 is not the only `23505` this flow can meet: CST-006's primary-contact
 * arbiter is one, and so is the customers primary key. A guard written against
 * the SQLSTATE — or against `kind === 'CONFLICT'` alone — would report every one
 * of them as a lost verification race, which is worse than crashing: it reports a
 * race that did not happen and hides a defect that did.
 *
 * These cases live at the unit tier because the states they need cannot be
 * arranged through a real database from inside this service. The service picks
 * fresh ids, so a primary-key collision is unreachable, and CST-006 cannot fire
 * on a path that never sets a second primary. A stub repository is the only way
 * to observe what the guard does with an error it must not claim.
 */
import { persistenceError } from '@embroidery/database';
import type { TransactionManager } from '@embroidery/persistence';

import { ResolveOrCreateVerifiedCustomer } from './resolve-or-create-verified-customer.service';
import type { CustomerIdentityAuditRecorder } from './customer-identity-audit.recorder';
import { normalizeEmail } from '../domain/contact/normalize-email';
import type { VerifiedContactEvidence } from '../domain/identity/verified-contact-evidence';
import { isVerifiedIdentityConflict } from '../domain/identity/verified-identity-outcome';
import type { CustomerRepository } from '../domain/repositories/customer.repository';

/** Runs the callback directly: transaction semantics are proven against a real database. */
const transactions = {
  runInTransaction: <T>(work: () => T | Promise<T>): Promise<T> => Promise.resolve(work()),
} as unknown as TransactionManager;

const recorder = {
  recordIdentityCreated: (): Promise<void> => Promise.resolve(),
  recordContactAttached: (): Promise<void> => Promise.resolve(),
} as unknown as CustomerIdentityAuditRecorder;

function evidence(): VerifiedContactEvidence {
  const result = normalizeEmail('guard@example.com');
  if (!result.ok) throw new Error('fixture is not normalizable');
  return { contact: result.contact, verifiedAt: new Date(), verifiedSource: 'OTP' };
}

/** A repository whose creation always fails with the supplied error. */
function repositoryFailingWith(error: Error): CustomerRepository {
  return {
    findByVerifiedContact: () => Promise.resolve(undefined),
    createWithVerifiedContact: () => Promise.reject(error),
  } as unknown as CustomerRepository;
}

function serviceFailingWith(error: Error): ResolveOrCreateVerifiedCustomer {
  return new ResolveOrCreateVerifiedCustomer(repositoryFailingWith(error), transactions, recorder);
}

describe('ResolveOrCreateVerifiedCustomer conflict guard', () => {
  it('converts the CST-005 arbiter into a concurrent-verification loss', async () => {
    const service = serviceFailingWith(
      persistenceError({
        kind: 'CONFLICT',
        code: 'CONTACT_ALREADY_VERIFIED',
        message: 'This contact is already verified for another customer.',
      }),
    );

    const failure = await service.resolve(evidence()).catch((error: unknown) => error);

    expect(isVerifiedIdentityConflict(failure)).toBe(true);
    expect(isVerifiedIdentityConflict(failure) ? failure.failure : undefined).toBe(
      'CONCURRENT_VERIFICATION_LOSS',
    );
  });

  it.each([
    ['CST-006, the primary-contact arbiter', 'CONFLICT', 'PRIMARY_CONTACT_ALREADY_SET'],
    ['an uncatalogued unique arbiter', 'CONFLICT', 'DUPLICATE_RESOURCE'],
    ['a check constraint', 'INVARIANT_VIOLATION', 'VALUE_NOT_ALLOWED'],
    ['an unresolved reference', 'INVALID_REFERENCE', 'REFERENCE_NOT_FOUND'],
  ] as const)('lets %s travel as itself', async (_label, kind, code) => {
    const original = persistenceError({ kind, code, message: 'The operation failed.' });
    const service = serviceFailingWith(original);

    const failure = await service.resolve(evidence()).catch((error: unknown) => error);

    expect(failure).toBe(original);
    expect(isVerifiedIdentityConflict(failure)).toBe(false);
  });

  it('lets a non-persistence failure travel as itself', async () => {
    const original = new Error('the pool is gone');
    const service = serviceFailingWith(original);

    await expect(service.resolve(evidence())).rejects.toBe(original);
  });

  it('refuses an unbounded verified source before touching the repository', async () => {
    let called = false;
    const repository = {
      findByVerifiedContact: (): Promise<undefined> => {
        called = true;
        return Promise.resolve(undefined);
      },
    } as unknown as CustomerRepository;
    const service = new ResolveOrCreateVerifiedCustomer(repository, transactions, recorder);

    const failure = await service
      .resolve({ ...evidence(), verifiedSource: 'contact: guard@example.com' })
      .catch((error: unknown) => error);

    expect(isVerifiedIdentityConflict(failure) ? failure.failure : undefined).toBe(
      'VERIFIED_SOURCE_NOT_ALLOWED',
    );
    expect(called).toBe(false);
  });
});
