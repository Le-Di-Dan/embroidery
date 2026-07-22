import { randomUUID } from 'node:crypto';

/**
 * Canonical request-ID contract (APP0-B02).
 *
 * The gateway (D-036) is the first boundary that normalises a client-supplied
 * correlation ID: it reuses an incoming `X-Request-ID` only when it matches a
 * conservative allowlist and otherwise substitutes its own native id. The API
 * consumes that *effective* id and must apply the identical allowlist, or the
 * two boundaries would disagree about which values are acceptable and the
 * correlation chain would silently break.
 *
 * These constants are therefore the single source of truth for the pattern:
 * runtime validation, the OpenAPI header schema, and the gateway drift test all
 * read them. Never re-declare the pattern anywhere else.
 *
 * Placement note: this contract is API-local rather than in
 * `packages/contracts` because that package still resolves to TypeScript source
 * (`main: ./src/index.ts`) and is consumed only by bundled frontend targets. The
 * compiled API runtime (`node dist/main.js`, IMP-D018) cannot require it. Moving
 * the contract there is a follow-up for APP0-C02, when the generated client
 * genuinely needs it.
 */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/** Node lowercases incoming header names; this is the lookup key on `req.headers`. */
export const REQUEST_ID_HEADER_LOOKUP = 'x-request-id';

/** Must stay byte-identical to the Nginx `$effective_request_id` map pattern. */
export const REQUEST_ID_PATTERN_SOURCE = '^[A-Za-z0-9._-]{1,64}$';

export const REQUEST_ID_MIN_LENGTH = 1;
export const REQUEST_ID_MAX_LENGTH = 64;

/**
 * Deliberately built without the `g` flag: a global RegExp carries `lastIndex`
 * state between calls and would make validation depend on call order.
 */
const REQUEST_ID_PATTERN = new RegExp(REQUEST_ID_PATTERN_SOURCE);

/**
 * Allowlist semantics: a value is accepted exactly as received or not at all.
 * Nothing is trimmed or normalised, because trimming would accept a value the
 * gateway rejected and reintroduce the header-abuse surface the allowlist
 * exists to close (`" abc "` is invalid, not `"abc"`).
 */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/**
 * Fallback used only when the API is reached without a usable gateway header
 * (direct access, or a client sending an unsafe value). `randomUUID` is a
 * built-in CSPRNG whose output is 36 characters of `[0-9a-f-]` and therefore
 * always satisfies the allowlist above — no timestamp, no `Math.random`, and no
 * machine- or process-derived component.
 */
export function generateRequestId(): string {
  return randomUUID();
}
