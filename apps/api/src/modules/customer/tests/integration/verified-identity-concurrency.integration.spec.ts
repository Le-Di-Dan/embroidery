/**
 * `APP4-B02` — CST-005 as the real arbiter, under a real race.
 *
 * A read-then-write check cannot decide this: both transactions look, both see
 * nothing, and both insert. The partial unique index
 * `uq_customer_contact_points__kind_value__verified` is what makes the second one
 * lose, and the point of this suite is that the loss is a *named business
 * outcome* rather than a 500, a swallowed duplicate, or a merge.
 *
 * The race is genuine rather than simulated. Two `resolve` calls run
 * concurrently on separate pooled connections, so each issues its lookup before
 * either issues its insert; PostgreSQL then blocks the second inserter on the
 * unique index until the first transaction commits, and only then reports
 * `23505`. Nothing here sleeps, and nothing patches the service.
 *
 * Kept in its own file because it is its own responsibility, not to shorten
 * another. This is a separate suite in the plain sense: broad concurrency
 * behaviour is DB8's, and this proves exactly one arbiter for one flow.
 */
import {
  createVerifiedIdentityContext,
  emailEvidence,
  type VerifiedIdentityContext,
} from './verified-identity-context';
import {
  activeVerifiedOwners,
  auditEventCount,
  contactValueAppearsInAudit,
  customerCount,
  primaryContactsOf,
} from './verified-identity-queries';
import {
  isVerifiedIdentityConflict,
  type VerifiedIdentityResolution,
} from '../../domain/identity/verified-identity-outcome';

const CONTESTED = 'contested@example.com';

describe('APP4-B02 concurrent verification (integration)', () => {
  let context: VerifiedIdentityContext;

  beforeAll(async () => {
    context = await createVerifiedIdentityContext('app4-b02-concurrency');
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  it('gives one winner, one owner, no orphan and a bounded loss', async () => {
    const settled = await Promise.allSettled([
      context.inRequest(() => context.service.resolve(emailEvidence(CONTESTED))),
      context.inRequest(() => context.service.resolve(emailEvidence(CONTESTED))),
    ]);

    const winners = settled.filter(
      (result): result is PromiseFulfilledResult<VerifiedIdentityResolution> =>
        result.status === 'fulfilled',
    );
    const losers = settled.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0]?.value.outcome).toBe('CREATED');

    // A named outcome the future `APP4-B04` can act on, not an internal error.
    const loss: unknown = losers[0]?.reason;
    expect(isVerifiedIdentityConflict(loss)).toBe(true);
    if (!isVerifiedIdentityConflict(loss)) return;
    expect(loss.failure).toBe('CONCURRENT_VERIFICATION_LOSS');

    // Nothing about the database, the constraint or the address travelled with
    // it: the message is the code, and there is no cause to unwrap.
    expect(loss.message).toBe('CONCURRENT_VERIFICATION_LOSS');
    expect(loss.cause).toBeUndefined();
    const serialized = `${String(loss.stack)} ${JSON.stringify(loss)}`;
    for (const forbidden of [
      CONTESTED,
      '23505',
      'uq_customer_contact_points',
      'customer_contact_points',
      'DETAIL',
      'Key (',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // The loser rolled back whole: no orphan customer, no second owner, and no
    // audit row for an identity that never existed.
    const winner = winners[0]?.value.customerId;
    expect(await customerCount(context)).toBe(1);
    const owners = await activeVerifiedOwners(context, 'EMAIL', CONTESTED);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.customer_id).toBe(winner);
    expect(await primaryContactsOf(context, String(winner))).toHaveLength(1);
    expect(await auditEventCount(context)).toBe(1);
    expect(await contactValueAppearsInAudit(context, CONTESTED)).toBe(false);
  });

  it('resolves the winner on the retry that follows a loss', async () => {
    // What `APP4-B04` will do with the bounded outcome: the identity now has an
    // owner, so a second attempt resolves it instead of creating anything.
    const settled = await Promise.allSettled([
      context.inRequest(() => context.service.resolve(emailEvidence(CONTESTED))),
      context.inRequest(() => context.service.resolve(emailEvidence(CONTESTED))),
    ]);
    const winner = settled.find((result) => result.status === 'fulfilled');
    expect(winner?.status).toBe('fulfilled');

    const retry = await context.inRequest(() => context.service.resolve(emailEvidence(CONTESTED)));

    expect(retry.outcome).toBe('RESOLVED');
    if (winner?.status === 'fulfilled') {
      expect(retry.customerId).toBe(winner.value.customerId);
    }
    expect(await customerCount(context)).toBe(1);
    expect(await auditEventCount(context)).toBe(1);
  });
});
