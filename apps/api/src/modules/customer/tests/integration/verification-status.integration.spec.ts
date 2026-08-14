/**
 * `APP4-B04` — the read-only challenge status.
 *
 * Two properties, and the second is the one an implementation gets wrong by
 * being helpful: the endpoint reports the *effective* state, and it reaches
 * that answer without writing anything. A GET that swept the row it found to be
 * past its expiry would work perfectly and would hand lifecycle transitions to
 * anyone able to poll.
 *
 * Every LC-02 state is covered, including the one that has no column: an
 * `ISSUED` row whose `expires_at` has passed with no sweep behind it.
 */
import {
  createAttemptContext,
  WRONG_CODE,
  type AttemptTestContext,
} from './verification-attempt-context';
import { CHALLENGE_POLICY } from './verification-issue-context';
import { attemptsOf, auditEvents, challengeStateOf } from './verification-attempt-queries';

const EMAIL = 'trang.thai@example.com';

describe('APP4-B04 verification challenge status (integration)', () => {
  let context: AttemptTestContext;

  beforeAll(async () => {
    context = await createAttemptContext('app4-b04-status');
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    context.clock.set(new Date('2026-08-14T09:00:00.000Z'));
    context.minter.reset();
    await context.publishPolicy(CHALLENGE_POLICY);
  });

  const read = (challengeId: string): Promise<{ state: string; expiresAt: Date } | undefined> =>
    context.statuses.read(challengeId as never);

  it('reports ISSUED and the expiry of a live challenge', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');

    const status = await read(challenge.challengeId);
    expect(status?.state).toBe('ISSUED');
    expect(status?.expiresAt.toISOString()).toBe(challenge.expiresAt.toISOString());
  });

  it('reports VERIFIED after a correct answer', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    await context.inRequest(() => context.attempts.submit(challenge.challengeId, challenge.code));

    expect((await read(challenge.challengeId))?.state).toBe('VERIFIED');
  });

  it('reports FAILED once the attempt budget is spent', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    for (let attempt = 0; attempt < CHALLENGE_POLICY.maxAttempts; attempt += 1) {
      await context.inRequest(() => context.attempts.submit(challenge.challengeId, WRONG_CODE));
    }

    expect((await read(challenge.challengeId))?.state).toBe('FAILED');
  });

  it('reports CANCELLED for a challenge a resend replaced', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    context.clock.advanceSeconds(CHALLENGE_POLICY.resendCooldownSeconds);
    await context.inRequest(() => context.resending.resend(challenge.challengeId));

    expect((await read(challenge.challengeId))?.state).toBe('CANCELLED');
  });

  it('reports EXPIRED for a swept challenge', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    context.clock.set(challenge.expiresAt);
    // The attempt path performs the physical transition; the read only observes.
    await context.inRequest(() => context.attempts.submit(challenge.challengeId, WRONG_CODE));

    expect(await challengeStateOf(context, challenge.challengeId)).toBe('EXPIRED');
    expect((await read(challenge.challengeId))?.state).toBe('EXPIRED');
  });

  it('reports EXPIRED for a persisted ISSUED row past its expiry, and writes nothing', async () => {
    const challenge = await context.open('EMAIL', EMAIL, 'SUBMISSION');
    context.clock.set(new Date(challenge.expiresAt.getTime() + 1_000));

    const auditBefore = (await auditEvents(context)).length;

    // Read twice: a mutation on the first call would show up on the second.
    expect((await read(challenge.challengeId))?.state).toBe('EXPIRED');
    expect((await read(challenge.challengeId))?.state).toBe('EXPIRED');

    // The row itself is untouched — the physical transition belongs to the
    // issue and attempt paths, not to a GET.
    expect(await challengeStateOf(context, challenge.challengeId)).toBe('ISSUED');
    expect(await attemptsOf(context, challenge.challengeId)).toHaveLength(0);
    expect((await auditEvents(context)).length).toBe(auditBefore);
  });

  it('reports nothing for an unknown id', async () => {
    expect(await read('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071')).toBeUndefined();
  });
});
