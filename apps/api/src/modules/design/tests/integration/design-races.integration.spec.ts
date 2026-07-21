/**
 * CC-01 — design session autosave compare-and-set under real contention
 * (DB9-CP0, additive DB8 correction).
 *
 * `DB8_DB9_HANDOFF.md` §2 flagged CC-01 as the one deferred row *not*
 * covered by shape-sharing: `saveDocument` guards with an application-level
 * `autosaveRevision` predicate (G-DB7-19), not a `FOR UPDATE` anchor and not
 * a unique arbiter, so none of DB8's eight P0 proofs exercise its failure
 * mode. The live repository exists (`DrizzleDesignSessionRepository`), so
 * this is a genuine untested concurrency path rather than unbuilt work —
 * DB9's preflight closes it here instead of absorbing an open correctness
 * question into a performance phase.
 *
 * Two independently pooled actors, barrier-ordered so the interleaving is
 * deterministic rather than timing-dependent.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { Barrier } from '../../../../tests/integration/db8-barrier';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { DesignModule } from '../../design.module';
import { DESIGN_SESSION_REPOSITORY } from '../../domain/repositories/design-session.repository';
import type {
  DesignSessionId,
  DesignSessionRepository,
} from '../../domain/repositories/design-session.repository';
import { seedDesignChain } from './design-fixture';
import type { DesignFixture } from './design-fixture';

describe('design session concurrency races (DB9-CP0, integration)', () => {
  let context: ConcurrencyTestContext;
  let alice: ConcurrencyActor;
  let bob: ConcurrencyActor;
  let fixture: DesignFixture;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db9-cp0-design', [DesignModule]);
    alice = await context.spawnActor('alice');
    bob = await context.spawnActor('bob');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedDesignChain(context);
  });

  function sessionsOf(actor: ConcurrencyActor): DesignSessionRepository {
    return actor.get<DesignSessionRepository>(DESIGN_SESSION_REPOSITORY);
  }

  async function openSession(): Promise<DesignSessionId> {
    const id = newId() as DesignSessionId;
    await alice.inTransaction(() =>
      sessionsOf(alice).open({
        id,
        sessionSecretHash: `hash-${id}`,
        productId: fixture.placement.productId,
        productVariantId: fixture.placement.productVariantId,
        productSideId: fixture.placement.productSideId,
        embroideryAreaId: fixture.placement.embroideryAreaId,
        designDocument: { elements: [] },
        documentSchemaVersion: 1,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    );
    return id;
  }

  async function revisionOf(id: DesignSessionId): Promise<number> {
    const rows = await alice.snapshot<{ autosave_revision: number }>(
      sql`select autosave_revision from design_sessions where id = ${id}`,
    );
    return Number(rows[0]?.autosave_revision);
  }

  function save(actor: ConcurrencyActor, id: DesignSessionId, marker: string): Promise<unknown> {
    return actor.inTransaction(() =>
      sessionsOf(actor).saveDocument({
        id,
        designDocument: { elements: [{ marker }] },
        documentSchemaVersion: 1,
        expectedRevision: 0,
      }),
    );
  }

  /**
   * Resolves once a backend on this database is genuinely blocked waiting
   * for a lock. Polls a catalog view rather than sleeping a guessed
   * interval, so the handoff is driven by observed database state.
   */
  async function awaitLockWaiter(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await alice.snapshot<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity
            where datname = current_database()
              and wait_event_type = 'Lock'
              and state = 'active'`,
      );
      if (Number(rows[0]?.waiting) > 0) {
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('Timed out waiting for a blocked backend to appear in pg_stat_activity.');
  }

  function asPersistenceError(error: unknown): PersistenceError {
    if (!isPersistenceError(error)) {
      throw new Error(`Expected a PersistenceError, received: ${String(error)}`);
    }
    return error;
  }

  it('CC-01: two saves against the same revision never both advance it; the loser gets STALE_WRITE', async () => {
    const id = await openSession();
    const barrier = new Barrier();

    // Alice takes the row's write lock and holds it open. Bob's UPDATE then
    // blocks on that lock rather than racing on timing, so PostgreSQL — not
    // the scheduler — decides the order, and Bob re-evaluates the
    // `autosaveRevision = 0` predicate only after Alice's commit is visible.
    const aliceRun = alice.inTransaction(async () => {
      await sessionsOf(alice).saveDocument({
        id,
        designDocument: { elements: [{ marker: 'alice' }] },
        documentSchemaVersion: 1,
        expectedRevision: 0,
      });
      barrier.signal('alice-updated');
      await barrier.waitFor('bob-blocked');
    });

    const bobRun = (async () => {
      await barrier.waitFor('alice-updated');
      // Bob's statement blocks inside the repository call, so the release
      // signal has to come from an observer, not from Bob himself. The
      // observer waits on an actual PostgreSQL condition — Bob's backend
      // registered as waiting on a lock — rather than on a fixed sleep.
      const attempt = save(bob, id, 'bob');
      void awaitLockWaiter().then(() => barrier.signal('bob-blocked'));
      return attempt;
    })();

    const [aliceOutcome, bobOutcome] = await Promise.allSettled([aliceRun, bobRun]);

    expect(aliceOutcome.status).toBe('fulfilled');
    expect(bobOutcome.status).toBe('rejected');

    const failure = asPersistenceError(
      bobOutcome.status === 'rejected' ? bobOutcome.reason : undefined,
    );
    expect(failure.kind).toBe('INVARIANT_VIOLATION');
    expect(failure.code).toBe('STALE_WRITE');
    expect(failure.retryable).toBe(false);

    // The decisive invariant: exactly one increment, and the surviving
    // document is the winner's — never a lost update, never revision 2.
    expect(await revisionOf(id)).toBe(1);
    const rows = await alice.snapshot<{ design_document: { elements: { marker: string }[] } }>(
      sql`select design_document from design_sessions where id = ${id}`,
    );
    expect(rows[0]?.design_document.elements[0]?.marker).toBe('alice');
  }, 60_000);

  it('CC-01b: an unblocked concurrent pair still increments exactly once (10 iterations)', async () => {
    // The barrier-free variant: whichever transaction PostgreSQL orders
    // first must win, and the revision must land on 1 every single time.
    // Repeated because a CAS defect shows up as an *intermittent* lost
    // update, which one run would not catch.
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const id = await openSession();

      const outcomes = await Promise.allSettled([save(alice, id, 'alice'), save(bob, id, 'bob')]);

      const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(asPersistenceError(rejected[0]?.reason).code).toBe('STALE_WRITE');
      expect(await revisionOf(id)).toBe(1);
    }
  }, 180_000);
});
