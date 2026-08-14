/**
 * Verification-code issuance (`APP4-P01`, `ADR-APP4-001` §1.3, §5.1).
 *
 * Exactly six decimal digits from a CSPRNG, and **unbiased**. The obvious
 * one-liner is the wrong one:
 *
 * ```
 * randomBytes(6).map((b) => b % 10)   // WRONG
 * ```
 *
 * A byte is uniform over 0–255, and 256 is not a multiple of 10, so `% 10`
 * makes digits 0–5 appear 26 times per 256 draws and digits 6–9 only 25 — each
 * low digit is ~4% more likely than each high one. Over six positions that is a
 * measurable skew in a space of only 10^6, and `ADR-APP4-001` prohibits it by
 * name.
 *
 * The fix is **rejection sampling**: 250 is the largest multiple of 10 that fits
 * in a byte, so bytes 250–255 are discarded and the remainder is exactly
 * uniform. Nothing is approximated and no arithmetic correction is applied — the
 * biased draws are simply thrown away.
 *
 * A leading zero is a valid code. The result is a six-character *string* for
 * that reason: as a number, `042915` would render as `42915` and fail
 * verification against its own digest.
 *
 * Nothing here persists or logs the code. The raw value exists only long enough
 * for the caller to hash it and seal it into a delivery envelope.
 */
import { randomBytes } from 'node:crypto';

/** `ADR-APP4-001` §1.3 — `verification.challenge.codeLength`. */
export const VERIFICATION_CODE_LENGTH = 6;

/** `ADR-APP4-001` §1.3 — `verification.challenge.codeAlphabet = DECIMAL_DIGITS`. */
const RADIX = 10;

/** The largest multiple of the radix representable in one byte: 25 × 10. */
export const REJECTION_THRESHOLD = 250;

/**
 * How many draw rounds may be exhausted before giving up.
 *
 * Each round asks for twice the digits still needed, so the chance of any real
 * CSPRNG failing this is negligible — the bound exists so an injected test
 * source that returns only rejected bytes terminates instead of hanging.
 */
const MAX_ROUNDS = 16;

/** Mirrors `RandomBytesSource` in the Design Session issuer — the same seam. */
export type RandomBytesSource = (size: number) => Buffer;

/**
 * Issues one verification code.
 *
 * `random` is injectable purely as a test seam: it lets a spec pin an exact
 * output — a leading zero, or the rejection path — without a probabilistic
 * distribution test that would be slow and flaky. Production always uses
 * `node:crypto.randomBytes`.
 */
export function issueVerificationCode(random: RandomBytesSource = randomBytes): string {
  const digits: string[] = [];

  for (let round = 0; round < MAX_ROUNDS && digits.length < VERIFICATION_CODE_LENGTH; round += 1) {
    const needed = VERIFICATION_CODE_LENGTH - digits.length;
    // Over-draw so a handful of rejections still finishes the code in one round.
    const batch = random(needed * 2);
    for (const byte of batch) {
      if (byte >= REJECTION_THRESHOLD) continue;
      digits.push(String(byte % RADIX));
      if (digits.length === VERIFICATION_CODE_LENGTH) break;
    }
  }

  if (digits.length < VERIFICATION_CODE_LENGTH) {
    // Unreachable with a real CSPRNG. Failing closed is still correct: issuing a
    // short or padded code would produce a credential the verifier cannot match.
    throw new Error('Verification code generation exhausted its randomness budget.');
  }
  return digits.join('');
}
