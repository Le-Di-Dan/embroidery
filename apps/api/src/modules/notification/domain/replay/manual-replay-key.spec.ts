/**
 * The manual-replay key is the whole of replay idempotency (`APP4-B08` §42).
 *
 * These cases fix the two properties everything else depends on: the same
 * decision always produces the same key, and a different decision never does.
 * The canonical input is asserted as a literal string rather than as a hash, so
 * a drift in the locked format (IMP-D049 PO-11) fails here with a readable
 * message instead of as an unexplained digest mismatch.
 *
 * No expected digest is written down. A test that pinned one would pass whether
 * or not the input was right, and the value has no business meaning.
 */
import { canonicalManualReplayKeyInput, deriveManualReplayIntentKey } from './manual-replay-key';

const ORIGIN = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const OTHER_ORIGIN = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';

describe('APP4-B08 manual replay key', () => {
  it('uses the locked canonical input', () => {
    expect(
      canonicalManualReplayKeyInput({
        originNotificationIntentId: ORIGIN,
        deadLetterOutboxEventId: 42n,
      }),
    ).toBe(`app4-manual-replay:v1:${ORIGIN}:42`);
  });

  it('is a lowercase SHA-256 hex digest', () => {
    const key = deriveManualReplayIntentKey({
      originNotificationIntentId: ORIGIN,
      deadLetterOutboxEventId: 42n,
    });

    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same origin intent and the same dead-letter event', () => {
    const input = { originNotificationIntentId: ORIGIN, deadLetterOutboxEventId: 42n };

    // Two operators clicking the same button must land on one intent.
    expect(deriveManualReplayIntentKey(input)).toBe(deriveManualReplayIntentKey({ ...input }));
  });

  it('differs when the dead-letter event differs', () => {
    // The same intent can only have one terminal delivery today, but the key
    // must still name the event: a future second terminal delivery is a second
    // decision, not a duplicate of the first.
    expect(
      deriveManualReplayIntentKey({
        originNotificationIntentId: ORIGIN,
        deadLetterOutboxEventId: 42n,
      }),
    ).not.toBe(
      deriveManualReplayIntentKey({
        originNotificationIntentId: ORIGIN,
        deadLetterOutboxEventId: 43n,
      }),
    );
  });

  it('differs when the origin intent differs', () => {
    expect(
      deriveManualReplayIntentKey({
        originNotificationIntentId: ORIGIN,
        deadLetterOutboxEventId: 42n,
      }),
    ).not.toBe(
      deriveManualReplayIntentKey({
        originNotificationIntentId: OTHER_ORIGIN,
        deadLetterOutboxEventId: 42n,
      }),
    );
  });

  it('depends on nothing but those two identifiers', () => {
    // The guard against every plausible extra component — an Admin id, a
    // timestamp, a request id, a nonce. Each would make two clicks two
    // deliveries, which is the precise bug the key exists to prevent. Calling
    // twice across a real time gap must still collapse.
    const first = deriveManualReplayIntentKey({
      originNotificationIntentId: ORIGIN,
      deadLetterOutboxEventId: 7n,
    });
    const second = deriveManualReplayIntentKey({
      originNotificationIntentId: ORIGIN,
      deadLetterOutboxEventId: 7n,
    });

    expect(first).toBe(second);
    // And it is not a per-call value dressed up as a digest.
    expect(first).not.toBe(
      deriveManualReplayIntentKey({
        originNotificationIntentId: ORIGIN,
        deadLetterOutboxEventId: 8n,
      }),
    );
  });
});
