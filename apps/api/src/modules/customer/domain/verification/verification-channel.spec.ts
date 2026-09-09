/**
 * Customer verification is email only (`APP12-N01` §1, §20).
 *
 * Small, and deliberately so: this is the authority the issuer consults, and a
 * change to it changes what the whole system will send a code over. The public
 * request schema is asserted alongside it, because the two must not drift — a
 * schema that still admitted `PHONE` would push the refusal from a 400 at the
 * edge to a 422 deeper in, for no reason.
 */
import { VERIFICATION_CONTACT_KINDS, isVerificationContactKind } from './verification-channel';
import { issueVerificationChallengeSchema } from '../../presentation/schemas/public-verification.request';

describe('verification channel authority', () => {
  it('admits EMAIL and nothing else', () => {
    expect(VERIFICATION_CONTACT_KINDS).toEqual(['EMAIL']);
  });

  it('accepts EMAIL as a verification channel', () => {
    expect(isVerificationContactKind('EMAIL')).toBe(true);
  });

  it('refuses PHONE as a verification channel', () => {
    // A phone number remains a delivery contact. It is not a channel a code can
    // travel over, because no SMS transport exists and none will be added.
    expect(isVerificationContactKind('PHONE')).toBe(false);
  });
});

describe('the public issue-challenge contract', () => {
  it('accepts an EMAIL request', () => {
    const parsed = issueVerificationChallengeSchema.safeParse({
      contactKind: 'EMAIL',
      contact: 'nguoi.dung@vidu.test',
      purpose: 'SUBMISSION',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a PHONE request at the edge', () => {
    const parsed = issueVerificationChallengeSchema.safeParse({
      contactKind: 'PHONE',
      contact: '+84901234567',
      purpose: 'SUBMISSION',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an SMS request at the edge', () => {
    const parsed = issueVerificationChallengeSchema.safeParse({
      contactKind: 'SMS',
      contact: '+84901234567',
      purpose: 'SUBMISSION',
    });

    expect(parsed.success).toBe(false);
  });

  it('publishes the channel authority rather than a second copy of it', () => {
    const shape = issueVerificationChallengeSchema.shape.contactKind;

    expect(shape.options).toEqual([...VERIFICATION_CONTACT_KINDS]);
  });
});
