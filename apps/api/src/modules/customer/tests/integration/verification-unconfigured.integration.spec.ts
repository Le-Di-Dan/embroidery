/**
 * `APP4-B03` — what happens with no published policy.
 *
 * Its own context because the condition is the *absence* of a policy version,
 * and a suite that published one in `beforeAll` could only simulate it by
 * deleting rows. Fail-closed is the whole assertion: an unconfigured deployment
 * issues nothing rather than guessing a ten-minute expiry, because a credential
 * with an invented lifetime is worse than no credential.
 */
import {
  CHALLENGE_POLICY,
  createVerificationContext,
  type VerificationTestContext,
} from './verification-issue-context';
import { challengeCount, deliveryEvents, intents } from './verification-issue-queries';
import { isVerificationIssueFailure } from '../../domain/verification/verification-issue-outcome';

describe('APP4-B03 verification with no policy (integration)', () => {
  let context: VerificationTestContext;

  beforeAll(async () => {
    context = await createVerificationContext({ label: 'app4-b03-nopolicy' });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it('refuses to issue, and issues once the policy is published', async () => {
    const refusal = await context
      .inRequest(() =>
        context.issuance.issue({
          contactKind: 'EMAIL',
          contact: 'unconfigured@example.com',
          purpose: 'SUBMISSION',
        }),
      )
      .catch((error: unknown) => error);

    expect(isVerificationIssueFailure(refusal)).toBe(true);
    expect(isVerificationIssueFailure(refusal) ? refusal.failure : undefined).toBe(
      'VERIFICATION_POLICY_UNAVAILABLE',
    );
    // Nothing was minted and nothing was written: the refusal happens before the
    // transaction opens.
    expect(context.minter.minted).toHaveLength(0);
    expect(await challengeCount(context)).toBe(0);
    expect(await intents(context)).toHaveLength(0);
    expect(await deliveryEvents(context)).toHaveLength(0);

    await context.publishPolicy(CHALLENGE_POLICY);

    // Read at the point of use, so a policy published after boot works without
    // restarting the process.
    await expect(
      context.inRequest(() =>
        context.issuance.issue({
          contactKind: 'EMAIL',
          contact: 'unconfigured@example.com',
          purpose: 'SUBMISSION',
        }),
      ),
    ).resolves.toMatchObject({ outcome: 'ISSUED' });
  });
});
