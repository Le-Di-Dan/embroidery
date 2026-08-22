/**
 * The human order code (`COL-TBL043-02`, CST-030 family, `APP7-W01` §13).
 *
 * `ORD-` plus ten characters over the `G01-D12` alphabet, drawn by the **same**
 * mechanism `REQ-` and `QUO-` use — `@embroidery/domain-types`, promoted here by
 * this checkpoint because the order code is the third consumer and the first one
 * outside `apps/api` (`FU-APP6-B01-CODE-GENERATOR-PROMOTION-01`, closed).
 *
 * There is no second alphabet and no second mechanism: this file contributes a
 * prefix and nothing else.
 *
 * Like its two siblings the code is **never an authorization input**. It is a
 * public-facing identifier an Admin and a customer can read aloud, and nothing
 * accepts it as a credential. The uniqueness arbiter is `uq_orders__code`.
 *
 * `APP7-G01` §4 derives the bank-transfer reference from this code's ten-character
 * body. That derivation belongs to `APP7-B03`; nothing here composes, stores or
 * returns a payment reference.
 */
import { randomBytes } from 'node:crypto';

import {
  generateHumanCode,
  HUMAN_CODE_ALPHABET,
  HUMAN_CODE_BODY_LENGTH,
  humanCodePattern,
  type RandomBytesSource,
} from '@embroidery/domain-types';

/** The `G01-D12` alphabet, unchanged. */
export const ORDER_CODE_ALPHABET = HUMAN_CODE_ALPHABET;

export const ORDER_CODE_PREFIX = 'ORD-';

export const ORDER_CODE_LENGTH = HUMAN_CODE_BODY_LENGTH;

/** Exactly what {@link generateOrderCode} produces, and nothing else. */
export const ORDER_CODE_PATTERN = humanCodePattern(ORDER_CODE_PREFIX);

/**
 * Draws one code.
 *
 * The random source is a parameter so a test can prove the alphabet mapping and
 * the rejection behaviour deterministically; production never passes one.
 */
export function generateOrderCode(random: RandomBytesSource = randomBytes): string {
  return generateHumanCode(ORDER_CODE_PREFIX, random);
}
