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
 * rejection sampling below only guarantees an unbiased draw; a collision is
 * settled by the database and retried by the caller.
 */
import { randomBytes } from 'node:crypto';

/** `G01-D12`. Unambiguous when spoken and when typed. */
export const REQUEST_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const REQUEST_CODE_PREFIX = 'REQ-';

/** `G01-D12`. Ten characters over a 30-symbol alphabet ≈ 49 bits. */
export const REQUEST_CODE_LENGTH = 10;

/** Exactly what {@link generateRequestCode} produces, and nothing else. */
export const REQUEST_CODE_PATTERN = new RegExp(
  `^${REQUEST_CODE_PREFIX}[${REQUEST_CODE_ALPHABET}]{${String(REQUEST_CODE_LENGTH)}}$`,
);

/**
 * The largest byte value that maps onto whole alphabet repetitions.
 *
 * 256 is not a multiple of 30, so a plain `byte % 30` would make the first
 * sixteen symbols measurably more likely. Bytes at or above this ceiling are
 * discarded instead — the standard rejection sampling, stated here because a
 * "close enough" modulo is exactly the shortcut that silently costs entropy.
 */
const REJECTION_CEILING =
  Math.floor(256 / REQUEST_CODE_ALPHABET.length) * REQUEST_CODE_ALPHABET.length;

export type RandomBytesSource = (size: number) => Buffer;

/**
 * Draws one code.
 *
 * The random source is a parameter so a test can prove the alphabet mapping and
 * the rejection behaviour deterministically; production never passes one.
 */
export function generateRequestCode(random: RandomBytesSource = randomBytes): string {
  const characters: string[] = [];
  while (characters.length < REQUEST_CODE_LENGTH) {
    // Over-draw: at a ~6% rejection rate a single-byte-at-a-time loop would
    // make many more syscalls than one batch per round.
    for (const byte of random(REQUEST_CODE_LENGTH)) {
      if (byte >= REJECTION_CEILING) {
        continue;
      }
      characters.push(REQUEST_CODE_ALPHABET[byte % REQUEST_CODE_ALPHABET.length] as string);
      if (characters.length === REQUEST_CODE_LENGTH) {
        break;
      }
    }
  }
  return `${REQUEST_CODE_PREFIX}${characters.join('')}`;
}
