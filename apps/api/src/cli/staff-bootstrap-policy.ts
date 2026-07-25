/**
 * Staff-bootstrap environment policy (APP1-A01-C1, A01-FU03).
 *
 * Pure, side-effect-free helpers that decide — from the process environment
 * alone — whether the automatic Compose bootstrap may proceed, and how a result
 * maps to a process exit code. Kept free of NestJS and persistence so the policy
 * is unit-tested without a database. The canonical CLI (`staff-bootstrap.ts`)
 * wires these to the real use case.
 *
 * Policy (Product-Owner-locked):
 * - development/test with any required variable missing → fail (non-zero) so the
 *   stack is never advertised ready without a bootstrap admin;
 * - production with any required variable missing → skip (exit 0), never mutate;
 * - an unknown/empty environment fails closed (never production-skip semantics).
 *
 * Passwords are never inspected beyond a non-empty presence check and are never
 * included in any message; only variable NAMES are ever listed.
 */

/** The runtime environment signal is `NODE_ENV` (BACKEND_CONVENTIONS §16). */
export type BootstrapEnvironment = 'development' | 'production';

/** The closed set of machine-parseable bootstrap results (A01-C1 §20). */
export type BootstrapStatus =
  | 'CREATED'
  | 'REUSED_EXISTING'
  | 'SKIPPED_MISSING_ENV_PRODUCTION'
  | 'FAILED_MISSING_ENV_DEVELOPMENT'
  | 'FAILED_EXISTING_ADMIN_MISMATCH'
  | 'FAILED_EXISTING_ADMIN_NOT_ACTIVE'
  | 'FAILED_BOOTSTRAP';

export const REQUIRED_BOOTSTRAP_VARS = [
  'STAFF_BOOTSTRAP_EMAIL',
  'STAFF_BOOTSTRAP_PASSWORD',
  'STAFF_BOOTSTRAP_DISPLAY_NAME',
] as const;

/** Exit code per result: only the two success/skip states exit 0. */
export const STATUS_EXIT_CODE: Record<BootstrapStatus, number> = {
  CREATED: 0,
  REUSED_EXISTING: 0,
  SKIPPED_MISSING_ENV_PRODUCTION: 0,
  FAILED_MISSING_ENV_DEVELOPMENT: 1,
  FAILED_EXISTING_ADMIN_MISMATCH: 1,
  FAILED_EXISTING_ADMIN_NOT_ACTIVE: 1,
  FAILED_BOOTSTRAP: 1,
};

export interface BootstrapCredentials {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export interface EnvInspection {
  /** Resolved environment, or `undefined` when the signal is unknown/empty. */
  readonly environment: BootstrapEnvironment | undefined;
  /** Names (never values) of required variables that are absent/blank. */
  readonly missing: readonly string[];
  /** Present, trimmed credentials — only set when nothing is missing. */
  readonly credentials?: BootstrapCredentials;
}

/**
 * Maps the `NODE_ENV` signal to a bootstrap environment. `test` follows the
 * strict development policy (missing env fails). Anything else — including an
 * empty value — is unknown and returns `undefined` so the caller fails closed.
 */
export function resolveBootstrapEnvironment(
  raw: string | undefined,
): BootstrapEnvironment | undefined {
  if (raw === 'development' || raw === 'test') {
    return 'development';
  }
  if (raw === 'production') {
    return 'production';
  }
  return undefined;
}

/** True when a value is absent or only whitespace. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

/**
 * Inspects the environment for the required bootstrap variables. Email and
 * display name are trimmed for the presence check; the password is treated as
 * missing only when empty and is otherwise passed through byte-for-byte (never
 * trimmed) to the canonical password service.
 */
export function inspectBootstrapEnv(env: NodeJS.ProcessEnv): EnvInspection {
  const environment = resolveBootstrapEnvironment(env['NODE_ENV']);

  const email = env['STAFF_BOOTSTRAP_EMAIL'];
  const password = env['STAFF_BOOTSTRAP_PASSWORD'];
  const displayName = env['STAFF_BOOTSTRAP_DISPLAY_NAME'];

  const missing: string[] = [];
  if (isBlank(email)) missing.push('STAFF_BOOTSTRAP_EMAIL');
  if (password === undefined || password === '') missing.push('STAFF_BOOTSTRAP_PASSWORD');
  if (isBlank(displayName)) missing.push('STAFF_BOOTSTRAP_DISPLAY_NAME');

  if (missing.length > 0) {
    return { environment, missing };
  }
  return {
    environment,
    missing,
    // Non-null by the checks above.
    credentials: {
      email: (email as string).trim(),
      password: password as string,
      displayName: (displayName as string).trim(),
    },
  };
}

export interface PreflightDecision {
  readonly status: BootstrapStatus;
  readonly message: string;
}

/**
 * Decides whether the bootstrap may reach the database. Returns a terminal
 * status (with a safe, value-free message) to stop early, or `undefined` to
 * proceed with the resolved credentials.
 */
export function decideBootstrapPreflight(inspection: EnvInspection): PreflightDecision | undefined {
  if (inspection.environment === undefined) {
    return {
      status: 'FAILED_BOOTSTRAP',
      message:
        'Unknown runtime environment (NODE_ENV). Refusing to bootstrap; set NODE_ENV to development or production.',
    };
  }

  if (inspection.missing.length > 0) {
    const names = inspection.missing.join(', ');
    if (inspection.environment === 'production') {
      return {
        status: 'SKIPPED_MISSING_ENV_PRODUCTION',
        message: `Staff bootstrap skipped in production: missing ${names}. No admin data was created or modified.`,
      };
    }
    return {
      status: 'FAILED_MISSING_ENV_DEVELOPMENT',
      message: `Staff bootstrap failed in development: missing ${names}. Set all STAFF_BOOTSTRAP_* variables.`,
    };
  }

  return undefined;
}
