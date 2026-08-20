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
 * ### Why this mirrors `request-code.ts` rather than importing it
 *
 * `APP5-G01`'s `generateRequestCode` is the same mechanism with a different
 * prefix, and it lives in the **order** module's domain. Importing it would
 * couple CTX-QUO to CTX-ORD's internals for a string generator, and promoting it
 * to app-shared would rewrite an accepted APP5 file for a reason APP5 did not
 * ask for. Two consumers is not yet the third that justifies a shared home
 * (`CLAUDE.md` §5), so the mechanism is restated at the narrowest scope and the
 * promotion is left to whoever needs the third code.
 */
import { randomBytes } from 'node:crypto';

/** Unambiguous when spoken and when typed — the `G01-D12` alphabet. */
export const QUOTATION_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const QUOTATION_CODE_PREFIX = 'QUO-';

export const QUOTATION_CODE_LENGTH = 10;

/** Exactly what {@link generateQuotationCode} produces, and nothing else. */
export const QUOTATION_CODE_PATTERN = new RegExp(
  `^${QUOTATION_CODE_PREFIX}[${QUOTATION_CODE_ALPHABET}]{${String(QUOTATION_CODE_LENGTH)}}$`,
);

/**
 * The largest byte value that maps onto whole alphabet repetitions.
 *
 * 256 is not a multiple of 30, so a plain `byte % 30` would make the first
 * sixteen symbols measurably more likely. Bytes at or above this ceiling are
 * discarded instead — the standard rejection sampling, stated because a "close
 * enough" modulo is exactly the shortcut that silently costs entropy.
 */
const REJECTION_CEILING =
  Math.floor(256 / QUOTATION_CODE_ALPHABET.length) * QUOTATION_CODE_ALPHABET.length;

export type RandomBytesSource = (size: number) => Buffer;

/**
 * Draws one code. The random source is a parameter so a test can prove the
 * alphabet mapping and the rejection behaviour deterministically; production
 * never passes one.
 */
export function generateQuotationCode(random: RandomBytesSource = randomBytes): string {
  const characters: string[] = [];
  while (characters.length < QUOTATION_CODE_LENGTH) {
    for (const byte of random(QUOTATION_CODE_LENGTH)) {
      if (byte >= REJECTION_CEILING) {
        continue;
      }
      characters.push(QUOTATION_CODE_ALPHABET[byte % QUOTATION_CODE_ALPHABET.length] as string);
      if (characters.length === QUOTATION_CODE_LENGTH) {
        break;
      }
    }
  }
  return `${QUOTATION_CODE_PREFIX}${characters.join('')}`;
}
