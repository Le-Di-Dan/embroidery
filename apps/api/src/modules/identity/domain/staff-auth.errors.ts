/**
 * Staff authentication domain errors (ADR-APP1-001 §12).
 *
 * Framework-free signals the application layer raises and the presentation layer
 * maps to safe HTTP responses. They deliberately carry no account-existence
 * detail: login failure is uniform whether the account is unknown, the password
 * is wrong, or the account is locked/disabled, so nothing here distinguishes
 * those cases in a client-visible way.
 */

/** Uniform login failure — never says which of the causes applied. */
export class StaffLoginFailedError extends Error {
  constructor() {
    super('Login failed.');
    this.name = 'StaffLoginFailedError';
  }
}

/** Too many login attempts in one dimension; carries the wait time. */
export class StaffRateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Too many login attempts.');
    this.name = 'StaffRateLimitedError';
  }
}
