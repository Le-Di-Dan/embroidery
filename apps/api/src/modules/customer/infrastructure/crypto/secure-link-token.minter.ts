import { Injectable } from '@nestjs/common';

import { issueSecureLinkToken } from '../../domain/secret/secure-link-token.issuer';

/**
 * The injectable seam over the `APP4-P01` secure-link token issuer (`APP4-B05`).
 *
 * The sibling of `VerificationCodeMinter`, and it adds no logic for the same
 * reason: the 256-bit CSPRNG draw, the unpadded base64url encoding and the
 * 43-character accepted form are all P01's, and a second generator is exactly
 * what `ADR-APP4-001` §5.2 prohibits.
 *
 * It exists so a focused test can know which token was minted without reading
 * one out of the ciphertext — which would prove the envelope round-trips rather
 * than that the *issued* token is the one that reached the digest column and the
 * outbound message.
 */
@Injectable()
export class SecureLinkTokenMinter {
  mint(): string {
    return issueSecureLinkToken();
  }
}
