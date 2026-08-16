/**
 * The human request code, as the confirmation page is allowed to treat it
 * (`APP5-G01` §5, `G01-D12`, `APP5-S02` §7).
 *
 * ### One thing this module does, and one thing it must never enable
 *
 * It validates a string well enough to *print* it. That is the entire contract.
 * The code is **never an authorization input** (`CST-026`): it opens nothing,
 * no endpoint accepts it, and `APP5-B03` — the only read of a request there is
 * — takes a secure-link token and refuses anything else. So the code arrives
 * here as a query parameter precisely *because* it is not a credential, and the
 * page that shows it makes no request of any kind.
 *
 * The validation is not security; it is honesty. `?ma=` is attacker-controlled
 * text, and rendering it unchecked would let a link plant an arbitrary sentence
 * inside a page that says "we received your request" — a plausible-looking
 * confirmation for a request that does not exist. React escapes the markup; it
 * cannot tell you the string is a lie. Matching the generator's own shape can:
 * a value that is not exactly what `generateRequestCode` produces is not shown
 * at all, and the page falls back to a confirmation that names no code.
 *
 * The alphabet is transcribed from the producer (`apps/api` request-code
 * domain) rather than imported — a Storefront bundle may not reach into a
 * backend application (`CLAUDE.md` §5), and the value is a locked business
 * decision (`G01-D12`) rather than a moving one.
 */

/** `G01-D12`. Omits `0`, `O`, `1`, `I`, `L` and `U`: the code is read aloud. */
const REQUEST_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

const REQUEST_CODE_PREFIX = 'REQ-';

/** `G01-D12`. Ten characters over a 30-symbol alphabet ≈ 49 bits. */
const REQUEST_CODE_LENGTH = 10;

const REQUEST_CODE_PATTERN = new RegExp(
  `^${REQUEST_CODE_PREFIX}[${REQUEST_CODE_ALPHABET}]{${String(REQUEST_CODE_LENGTH)}}$`,
);

/**
 * Returns the code when it is exactly one, and `undefined` for everything else.
 *
 * Nothing is repaired: no trim, no upper-casing, no prefix insertion. A code
 * the customer can read off this page must be the code the workshop will find,
 * and a "helpfully corrected" one would be a different request or none at all.
 * A repeated `?ma=` — which Next surfaces as an array — is not a code either.
 */
export function readRequestCode(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  return REQUEST_CODE_PATTERN.test(value) ? value : undefined;
}
