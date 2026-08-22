/**
 * The human request code (`APP5-G01` §5, `G01-D12`, `COL-TBL037-01`).
 *
 * `REQ-` plus ten characters drawn from a CSPRNG over an alphabet that omits
 * `0`, `O`, `1`, `I`, `L` and `U`, because the code is read aloud and retyped
 * from chat. Roughly 49 bits of entropy, so codes are not a sequence and the
 * code leaks no submission volume.
 *
 * It is **never an authorization input** (CST-026, `ADR-DB1-007`): grant-scoped
 * access is the mechanism, and nothing in APP5 accepts a code as a credential.
 * It is also never accepted from a client — this module is the only producer.
 *
 * The uniqueness arbiter is `uq_custom_requests__code`, not this function. The
 * rejection sampling in the shared mechanism only guarantees an unbiased draw;
 * a collision is settled by the database and retried by the caller.
 *
 * ### The mechanism moved; the code did not
 *
 * `APP7-W01` supplied the third consumer `quotation-code.ts` was waiting for
 * (`FU-APP6-B01-CODE-GENERATOR-PROMOTION-01`), and it lives in the **worker**,
 * which may not import `apps/api`. The alphabet, the ten-character body and the
 * rejection sampling therefore now live in `@embroidery/domain-types`; the
 * prefix, the published constants and the exported names below are unchanged,
 * and so is every byte this function can produce.
 */
import { randomBytes } from 'node:crypto';

import {
  generateHumanCode,
  HUMAN_CODE_ALPHABET,
  HUMAN_CODE_BODY_LENGTH,
  humanCodePattern,
  type RandomBytesSource as HumanCodeRandomBytesSource,
} from '@embroidery/domain-types';

/** `G01-D12`. Unambiguous when spoken and when typed. */
export const REQUEST_CODE_ALPHABET = HUMAN_CODE_ALPHABET;

export const REQUEST_CODE_PREFIX = 'REQ-';

/** `G01-D12`. Ten characters over a 30-symbol alphabet ≈ 49 bits. */
export const REQUEST_CODE_LENGTH = HUMAN_CODE_BODY_LENGTH;

/** Exactly what {@link generateRequestCode} produces, and nothing else. */
export const REQUEST_CODE_PATTERN = humanCodePattern(REQUEST_CODE_PREFIX);

export type RandomBytesSource = HumanCodeRandomBytesSource;

/**
 * Draws one code.
 *
 * The random source is a parameter so a test can prove the alphabet mapping and
 * the rejection behaviour deterministically; production never passes one.
 */
export function generateRequestCode(random: RandomBytesSource = randomBytes): string {
  return generateHumanCode(REQUEST_CODE_PREFIX, random);
}
