/**
 * The human-readable business code mechanism (`G01-D12`, `APP7-W01` §13).
 *
 * `REQ-`, `QUO-` and now `ORD-` are the same code: a fixed prefix followed by
 * ten characters drawn from a CSPRNG over an alphabet that omits `0`, `O`, `1`,
 * `I`, `L` and `U`, because the value is read aloud and retyped from chat.
 * Roughly 49 bits of entropy, so codes are not a sequence and a code leaks no
 * volume.
 *
 * ### Why this file exists now and did not exist before
 *
 * `quotation-code.ts` restated `request-code.ts` deliberately and said why:
 * *"Two consumers is not yet the third that justifies a shared home
 * (`CLAUDE.md` §5), so the mechanism is restated at the narrowest scope and the
 * promotion is left to whoever needs the third code."*
 * `APP7-W01` is that third consumer, and it is in a different **application** —
 * the order code is drawn by the worker, which may not import `apps/api`. So
 * the mechanism moves to the narrowest shared home that both applications
 * already depend on, and the two delivered call sites keep their own names,
 * their own prefixes and their own published constants.
 *
 * What does **not** move: the prefix, and the decision that a code is never an
 * authorization input (CST-026, `ADR-DB1-007`). Each context keeps those.
 *
 * The uniqueness arbiter is always the database — `uq_custom_requests__code`,
 * `uq_quotations__code`, `uq_orders__code` — never this function. The rejection
 * sampling below only guarantees an unbiased draw.
 */

/** `G01-D12`. Unambiguous when spoken and when typed. */
export const HUMAN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `G01-D12`. Ten characters over a 30-symbol alphabet ≈ 49 bits. */
export const HUMAN_CODE_BODY_LENGTH = 10;

/**
 * The largest byte value that maps onto whole alphabet repetitions.
 *
 * 256 is not a multiple of 30, so a plain `byte % 30` would make the first
 * sixteen symbols measurably more likely. Bytes at or above this ceiling are
 * discarded instead — the standard rejection sampling, stated here because a
 * "close enough" modulo is exactly the shortcut that silently costs entropy.
 */
const REJECTION_CEILING = Math.floor(256 / HUMAN_CODE_ALPHABET.length) * HUMAN_CODE_ALPHABET.length;

/**
 * A source of random bytes.
 *
 * Structurally `node:crypto`'s `randomBytes`, declared as an indexable byte
 * sequence so this module needs no Node type dependency of its own: every
 * caller passes `randomBytes`, and a test passes a deterministic stand-in.
 */
export type RandomBytesSource = (size: number) => Iterable<number>;

/** Exactly what {@link generateHumanCode} produces for `prefix`, and nothing else. */
export function humanCodePattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}$`);
}

/**
 * Draws one code.
 *
 * The random source is a parameter so a test can prove the alphabet mapping and
 * the rejection behaviour deterministically; production never passes one — each
 * consumer defaults it to `randomBytes` at its own call site, which keeps this
 * module free of any import.
 */
export function generateHumanCode(prefix: string, random: RandomBytesSource): string {
  const characters: string[] = [];
  while (characters.length < HUMAN_CODE_BODY_LENGTH) {
    // Over-draw: at a ~6% rejection rate a single-byte-at-a-time loop would
    // make many more syscalls than one batch per round.
    for (const byte of random(HUMAN_CODE_BODY_LENGTH)) {
      if (byte >= REJECTION_CEILING) {
        continue;
      }
      characters.push(HUMAN_CODE_ALPHABET[byte % HUMAN_CODE_ALPHABET.length] as string);
      if (characters.length === HUMAN_CODE_BODY_LENGTH) {
        break;
      }
    }
  }
  return `${prefix}${characters.join('')}`;
}
