/**
 * `APP4-B05` — business reissue and its concurrency guarantee.
 *
 * Business reissue is one of three delivery contracts `ADR-APP4-001` PO-10 keeps
 * apart, and the only one that mints. It is **not** `APP4-W01` transport retry
 * (same intent, same envelope, same secret) and **not** `APP4-B08` Admin replay
 * (new intent, byte-identical ciphertext). Every assertion below is chosen so
 * that an implementation which quietly became one of the other two would fail:
 * the token changes, the digest changes, the ciphertext changes, and the source
 * row ends terminal with a reason.
 */
import { openDeliveryEnvelope } from '@embroidery/notification-delivery';

import { GRANT_SUPERSEDED_REASON } from '../../domain/grant/secure-grant-outcome';

import {
  GRANT_POLICY,
  createGrantContext,
  type GrantFixture,
  type GrantTestContext,
} from './secure-grant-context';
import {
  activeGrantCount,
  grantAudit,
  grantCount,
  grantsFor,
  tokenAppearsAnywhere,
} from './secure-grant-queries';
import { deliveryEvents, intents } from './verification-issue-queries';

/**
 * A rendezvous for `count` callers: each waits until all have arrived.
 *
 * Without it a "concurrent" test is only concurrent by luck — the two calls
 * usually serialise, and the compare-and-set the test exists to exercise is
 * never reached.
 */
function barrier(count: number): () => Promise<void> {
  let arrived = 0;
  let release = (): void => undefined;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async (): Promise<void> => {
    arrived += 1;
    if (arrived >= count) release();
    await open;
  };
}

describe('APP4-B05 secure grant — business reissue', () => {
  let context: GrantTestContext;
  let target: GrantFixture;

  beforeAll(async () => {
    context = await createGrantContext({
      label: 'app4_b05_reissue',
      grantPolicy: GRANT_POLICY,
    });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-08-14T09:00:00.000Z'));
    context.tokens.reset();
    await context.publishGrantPolicy(GRANT_POLICY);
    target = await context.seedTarget();
  });

  const issue = (notify = false): Promise<{ grantId: string; rawToken: string }> =>
    context.inRequest(() =>
      context.grants.issue({
        customerId: target.customerId,
        customRequestId: target.customRequestId,
        notify,
      }),
    );

  const reissue = (notify = false): Promise<{ grantId: string; rawToken: string }> =>
    context.inRequest(() =>
      context.grants.reissue({
        customerId: target.customerId,
        customRequestId: target.customRequestId,
        notify,
      }),
    );

  it('rotates the token and leaves exactly one ACTIVE grant', async () => {
    const first = await issue();
    context.clock.advanceSeconds(3_600);

    const second = await reissue();

    expect(second.grantId).not.toBe(first.grantId);
    expect(second.rawToken).not.toBe(first.rawToken);

    const rows = await grantsFor(context, target.customRequestId);
    expect(rows).toHaveLength(2);
    expect(await activeGrantCount(context, target.customRequestId)).toBe(1);

    const source = rows.find((row) => row.id === first.grantId);
    const replacement = rows.find((row) => row.id === second.grantId);

    // The old token is invalidated and its row explains why.
    expect(source).toMatchObject({
      status: 'REVOKED',
      revoke_reason: GRANT_SUPERSEDED_REASON,
      superseded_by_grant_id: second.grantId,
    });
    expect(source?.revoked_at).not.toBeNull();

    // The new one is live, with its own digest and its own expiry.
    expect(replacement).toMatchObject({ status: 'ACTIVE', scope_kind: 'REQUEST_ACCESS' });
    expect(replacement?.token_hash).not.toBe(source?.token_hash);
    expect(new Date(`${replacement?.expires_at ?? ''}`).getTime()).toBeGreaterThan(
      new Date(`${source?.expires_at ?? ''}`).getTime(),
    );
  });

  it('audits the reissue with its lineage, and names no secret', async () => {
    const first = await issue();
    const second = await reissue();

    const events = await grantAudit(context);
    expect(events.map((event) => event.action)).toEqual([
      'secure_grant.issued',
      'secure_grant.reissued',
    ]);
    expect(events[1]).toMatchObject({ target_id: second.grantId });
    expect(events[1]?.summary).toMatchObject({ reissuedFromGrantId: first.grantId });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(first.rawToken);
    expect(serialized).not.toContain(second.rawToken);
    expect(serialized).not.toContain('#t=');
  });

  it('refuses to reissue when no ACTIVE grant exists', async () => {
    await expect(reissue()).rejects.toMatchObject({ failure: 'GRANT_NOT_ACTIVE' });
    expect(await grantCount(context)).toBe(0);
  });

  describe('notified reissue', () => {
    it('creates a new intent, a new outbox event and a new envelope', async () => {
      const first = await issue(true);
      const [firstEvent] = await deliveryEvents(context);

      const second = await reissue(true);

      const allIntents = await intents(context);
      const events = await deliveryEvents(context);
      expect(allIntents).toHaveLength(2);
      expect(events).toHaveLength(2);

      // A different intent for a different grant — the idempotency tuple is keyed
      // on the new grant id, so a reissue can never collapse onto the first
      // notification the way a duplicate request does.
      expect(allIntents[1]?.intent_key).not.toBe(allIntents[0]?.intent_key);
      expect(allIntents[1]?.params).toEqual({
        schemaVersion: 1,
        reference: { kind: 'SECURE_ACCESS_GRANT', grantId: second.grantId },
      });

      const secondEvent = events[1];
      // The ciphertext is *not* copied: `APP4-B08` replay is the contract that
      // reuses bytes, and this is not that. A fresh IV alone would change the
      // ciphertext, so the decisive assertion is the plaintext inside it.
      expect(secondEvent?.payload.ciphertext).not.toBe(firstEvent?.payload.ciphertext);
      expect(secondEvent?.payload.iv).not.toBe(firstEvent?.payload.iv);

      const opened = openDeliveryEnvelope(context.envelopeKey, secondEvent?.payload);
      expect(opened.secretKind).toBe('SECURE_LINK_TOKEN');
      expect(opened.secret).toBe(second.rawToken);
      expect(opened.secret).not.toBe(first.rawToken);

      expect(await tokenAppearsAnywhere(context, second.rawToken)).toEqual([]);
      expect(await tokenAppearsAnywhere(context, first.rawToken)).toEqual([]);
    });

    it('rolls the whole rotation back when the reissue transaction fails', async () => {
      const first = await issue();

      await expect(
        context.inRequest(() =>
          context.inTransaction(async () => {
            await context.grants.reissue({
              customerId: target.customerId,
              customRequestId: target.customRequestId,
              notify: true,
            });
            throw new Error('forced rollback');
          }),
        ),
      ).rejects.toThrow('forced rollback');

      // The source is still live and still the only grant: a half-applied
      // rotation would have left the customer with a revoked link and no
      // replacement.
      const rows = await grantsFor(context, target.customRequestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: first.grantId, status: 'ACTIVE', revoke_reason: null });
      expect(await intents(context)).toEqual([]);
    });
  });

  describe('concurrency', () => {
    it('cannot produce two ACTIVE grants when both reissues hold the same source', async () => {
      const first = await issue();

      // Two real transactions, forced to overlap. Both open, both read the same
      // ACTIVE source, and only then does either try to rotate it — which is the
      // interleaving that matters and the one an unsynchronised
      // `Promise.all([reissue(), reissue()])` usually misses, because the second
      // call often starts after the first has already committed and simply
      // rotates the *replacement* instead.
      //
      // The arbiter is the database. `revoke`'s `status = 'ACTIVE'` predicate is
      // a compare-and-set: the loser blocks on the winner's row lock, re-reads
      // under READ COMMITTED, matches nothing and unwinds. No mutex, no advisory
      // lock, no application-side election.
      const bothHaveRead = barrier(2);
      const race = (): Promise<unknown> =>
        context.inRequest(() =>
          context.inTransaction(async () => {
            await context.repository.listActiveForRequest(target.customRequestId);
            await bothHaveRead();
            return await context.grants.reissue({
              customerId: target.customerId,
              customRequestId: target.customRequestId,
            });
          }),
        );

      const results = await Promise.allSettled([race(), race()]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        failure: 'GRANT_CONCURRENT_REISSUE_LOSS',
      });

      // CST-009 intact: one replacement, one terminal source, no orphan.
      expect(await activeGrantCount(context, target.customRequestId)).toBe(1);
      const rows = await grantsFor(context, target.customRequestId);
      expect(rows).toHaveLength(2);

      const source = rows.find((row) => row.id === first.grantId);
      const active = rows.find((row) => row.status === 'ACTIVE');
      expect(source?.status).toBe('REVOKED');
      expect(source?.revoke_reason).toBe(GRANT_SUPERSEDED_REASON);
      expect(source?.superseded_by_grant_id).toBe(active?.id);
      expect(active?.id).not.toBe(first.grantId);
    });

    it('leaves one ACTIVE grant under an unsynchronised pair, however it interleaves', async () => {
      // Deliberately *not* synchronised, and deliberately asserting no outcome
      // count. Two unsynchronised reissues legitimately land either way: they
      // overlap and one loses the compare-and-set, or the second starts after
      // the first committed and rotates the replacement instead. Both are
      // correct, the timing is not reproducible, and a test that demanded one of
      // them would fail on a slow machine for no defect.
      //
      // What must hold in every interleaving is the invariant, so that is all
      // this asserts.
      const first = await issue();

      const results = await Promise.allSettled([reissue(), reissue()]);

      // Whatever failed, failed for the one bounded reason.
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toMatchObject({ failure: 'GRANT_CONCURRENT_REISSUE_LOSS' });
        }
      }
      expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

      // CST-009: exactly one live end, and no orphan.
      expect(await activeGrantCount(context, target.customRequestId)).toBe(1);

      const rows = await grantsFor(context, target.customRequestId);
      expect(rows.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
      expect(rows.find((row) => row.id === first.grantId)?.status).toBe('REVOKED');

      // Every superseded row points at its own replacement, so the lineage is a
      // chain rather than two rows claiming one successor.
      const replacements = rows
        .map((row) => row.superseded_by_grant_id)
        .filter((id): id is string => id !== null);
      expect(new Set(replacements).size).toBe(replacements.length);
      // Every revoked row carries a reason — the CHECK's rule, observed.
      for (const row of rows.filter((candidate) => candidate.status === 'REVOKED')) {
        expect(row.revoke_reason).toBe(GRANT_SUPERSEDED_REASON);
      }
    });
  });
});
