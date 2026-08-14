import { Injectable } from '@nestjs/common';

import { issueVerificationCode } from '../../domain/secret/verification-code.issuer';

/**
 * The injectable seam over the `APP4-P01` code issuer (`APP4-B03`).
 *
 * It adds no logic and must not: the unbiased rejection sampling, the six-digit
 * length and the leading-zero-safe string form are all P01's, and a second
 * generator is exactly what `ADR-APP4-001` §1.3 prohibits.
 *
 * It exists so a focused test can pin the value the recording adapter should
 * receive without reaching into `node:crypto`. Overriding this provider is how
 * the B03 → W01 handoff proof compares the delivered code to the issued one —
 * the alternative would be reading a code out of the ciphertext, which is the
 * thing the design exists to prevent.
 */
@Injectable()
export class VerificationCodeMinter {
  mint(): string {
    return issueVerificationCode();
  }
}
