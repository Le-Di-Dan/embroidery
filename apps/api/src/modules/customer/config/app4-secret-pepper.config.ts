/**
 * APP4 hash-pepper configuration (`APP4-P01`, `ADR-APP4-001` §5.3).
 *
 * Two peppers, deliberately separate, following the
 * `design-session-auth.config.ts` shape exactly: read once at load, held only
 * here, never logged, never serialized, never placed in a request context. A
 * missing or too-short value throws at configuration load — there is no default,
 * no development shortcut and no silent empty string, because a peppered HMAC
 * keyed on `''` verifies exactly like an unpeppered one.
 *
 * The separation is enforced, not merely documented. Three rejections carry it:
 *
 * - the two peppers must differ from each other — one value would mean one blast
 *   radius for two unrelated secret classes;
 * - neither may equal `NOTIFICATION_DELIVERY_ENVELOPE_KEY`, which is an AEAD key,
 *   a different primitive with a different rotation consequence (rotating a
 *   pepper invalidates every stored digest; rotating the envelope key makes every
 *   un-delivered envelope unopenable);
 * - neither may equal `DESIGN_SESSION_SECRET_PEPPER`, whose credential family is
 *   `IMP-D043`'s and not APP4's.
 *
 * Every error names the **variable** and nothing else — never the value, never
 * its length, never a fragment.
 */

export const APP4_SECRET_PEPPER_CONFIG = Symbol('APP4_SECRET_PEPPER_CONFIG');

/** `ADR-APP4-001` §5.3. Locked at `APP4-G01`; declared empty in `.env.example`. */
export const VERIFICATION_CODE_PEPPER_ENV = 'VERIFICATION_CODE_SECRET_PEPPER';
export const SECURE_LINK_TOKEN_PEPPER_ENV = 'SECURE_LINK_TOKEN_SECRET_PEPPER';

/** Names this configuration must never collide with, and why they exist. */
const FOREIGN_SECRET_ENVS = [
  'NOTIFICATION_DELIVERY_ENVELOPE_KEY',
  'DESIGN_SESSION_SECRET_PEPPER',
] as const;

/**
 * Minimum pepper length, matching `MIN_PEPPER_LENGTH` in the Design Session
 * configuration.
 *
 * Both secrets a pepper protects are already CSPRNG — a 256-bit token, and a
 * six-digit code whose brute-force resistance comes from the attempt limit, not
 * from entropy. The pepper's job is to make a stolen database useless, so 32
 * characters is simply the smallest value nobody types by hand as a placeholder.
 */
export const MIN_PEPPER_LENGTH = 32;

export interface App4SecretPepperConfig {
  /** Keys the HMAC over verification codes. */
  readonly verificationCodePepper: string;
  /** Keys the HMAC over secure-link tokens. */
  readonly secureLinkTokenPepper: string;
}

function requirePepper(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${name} is required: APP4 secrets are verified with a peppered HMAC and there is ` +
        'no unpeppered fallback.',
    );
  }
  if (value.length < MIN_PEPPER_LENGTH) {
    throw new Error(`${name} must be at least ${String(MIN_PEPPER_LENGTH)} characters.`);
  }
  return value;
}

/**
 * Loads and validates both peppers.
 *
 * Fails closed: any runtime path that issues or verifies an APP4 secret cannot
 * start without both values, which is the point — a process that cannot verify
 * a code must not accept one.
 */
export function loadApp4SecretPepperConfig(env: NodeJS.ProcessEnv): App4SecretPepperConfig {
  const verificationCodePepper = requirePepper(env, VERIFICATION_CODE_PEPPER_ENV);
  const secureLinkTokenPepper = requirePepper(env, SECURE_LINK_TOKEN_PEPPER_ENV);

  if (verificationCodePepper === secureLinkTokenPepper) {
    throw new Error(
      `${VERIFICATION_CODE_PEPPER_ENV} and ${SECURE_LINK_TOKEN_PEPPER_ENV} must be different ` +
        'values: one pepper for both secret classes couples two unrelated rotations.',
    );
  }

  for (const foreign of FOREIGN_SECRET_ENVS) {
    const other = env[foreign];
    if (other === undefined || other === '') continue;
    if (other === verificationCodePepper) {
      throw new Error(`${VERIFICATION_CODE_PEPPER_ENV} must not reuse the value of ${foreign}.`);
    }
    if (other === secureLinkTokenPepper) {
      throw new Error(`${SECURE_LINK_TOKEN_PEPPER_ENV} must not reuse the value of ${foreign}.`);
    }
  }

  return { verificationCodePepper, secureLinkTokenPepper };
}
