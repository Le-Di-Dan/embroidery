/**
 * The human quotation code (`COL-TBL050-02`, CST-035, `APP6-B01`).
 *
 * `QUO-` plus ten characters drawn from a CSPRNG over an alphabet that omits
 * `0`, `O`, `1`, `I`, `L` and `U`, because the code is read aloud and retyped.
 * Roughly 49 bits of entropy, so codes are not a sequence and the code leaks no
 * quotation volume.
 *
 * It is **never an authorization input**: quotation access is grant-scoped
 * (`APP6-B04`), and nothing accepts a code as a credential. It is also never
 * accepted from a client — this module is the only producer.
 *
 * The uniqueness arbiter is `uq_quotations__code`, not this function.
 *
 * ### The promotion this file asked for has happened
 *
 * This module used to restate `request-code.ts` and recorded why: *"Two
 * consumers is not yet the third that justifies a shared home … the promotion
 * is left to whoever needed the third code."* `APP7-W01` needs `ORD-`, from the
 * **worker**, which may not import `apps/api`. The alphabet, the ten-character
 * body and the rejection sampling now live once in `@embroidery/domain-types`
 * (`FU-APP6-B01-CODE-GENERATOR-PROMOTION-01`, closed). The prefix, the
 * published constants and every byte this function can produce are unchanged.
 */
import { randomBytes } from 'node:crypto';

import {
  generateHumanCode,
  HUMAN_CODE_ALPHABET,
  HUMAN_CODE_BODY_LENGTH,
  humanCodePattern,
  type RandomBytesSource as HumanCodeRandomBytesSource,
} from '@embroidery/domain-types';

/** Unambiguous when spoken and when typed — the `G01-D12` alphabet. */
export const QUOTATION_CODE_ALPHABET = HUMAN_CODE_ALPHABET;

export const QUOTATION_CODE_PREFIX = 'QUO-';

export const QUOTATION_CODE_LENGTH = HUMAN_CODE_BODY_LENGTH;

/** Exactly what {@link generateQuotationCode} produces, and nothing else. */
export const QUOTATION_CODE_PATTERN = humanCodePattern(QUOTATION_CODE_PREFIX);

export type RandomBytesSource = HumanCodeRandomBytesSource;

/**
 * Draws one code. The random source is a parameter so a test can prove the
 * alphabet mapping and the rejection behaviour deterministically; production
 * never passes one.
 */
export function generateQuotationCode(random: RandomBytesSource = randomBytes): string {
  return generateHumanCode(QUOTATION_CODE_PREFIX, random);
}
