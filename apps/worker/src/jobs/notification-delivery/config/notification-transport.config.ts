/**
 * Which outbound transport the notification worker uses, and the SMTP settings
 * it needs (`APP12-N01.B01`).
 *
 * `APP12-U01` found the release blocker this module closes: the repository had
 * exactly one `NotificationChannelPort` implementation, the in-memory recording
 * adapter, wired unconditionally — so a deployment "delivered" every verification
 * code to an array that died with the process, and no real customer could ever
 * order. The fix is not merely to add an SMTP adapter; it is to make choosing
 * *no* transport impossible to do by accident in production.
 *
 * ### Two transports, one deliberate choice
 *
 * ```text
 * NOTIFICATION_TRANSPORT = SMTP       production-capable email
 *                        | RECORDING  in-process capture, tests and local work
 * ```
 *
 * In `production` and `staging` the value must be `SMTP` and the SMTP block must
 * validate, or the process refuses to start. `RECORDING` is not merely
 * discouraged there — it is rejected, because the failure it causes is silent:
 * every send "succeeds", every metric is green, and nothing arrives.
 *
 * Elsewhere the variable is required to be *stated*, not defaulted. A default
 * would reintroduce the same defect one environment lower, where the UAT that
 * is supposed to catch it runs.
 *
 * ### Provider agnostic on purpose
 *
 * Plain SMTP, so a deployment can use any SMTP-capable account today and a
 * transactional provider later without touching business logic. No vendor name
 * appears in this file, no vendor SDK is imported by it, and nothing here knows
 * what a message looks like.
 *
 * ### Nothing in here is ever echoed
 *
 * Every validation error names the **variable** and never its value, in the
 * shape `loadStorefrontPublicOrigin` established. `SMTP_PASSWORD` in particular
 * is read once into the returned object and is never logged, rendered or
 * included in an error.
 */

/** The transports this worker can be configured with. */
export const NOTIFICATION_TRANSPORTS = ['SMTP', 'RECORDING'] as const;

export type NotificationTransport = (typeof NOTIFICATION_TRANSPORTS)[number];

export const NOTIFICATION_TRANSPORT_ENV = 'NOTIFICATION_TRANSPORT';

/** Environments in which a non-delivering transport is a release defect. */
const DELIVERING_ENVIRONMENTS = ['production', 'staging'];

export interface SmtpTransportConfig {
  readonly host: string;
  readonly port: number;
  /** Implicit TLS on connect (465). `false` still permits STARTTLS upgrades. */
  readonly secure: boolean;
  /**
   * Refuse to send at all unless the connection is encrypted.
   *
   * Defaults to `true` and **cannot be turned off in a delivering environment**
   * (see {@link loadNotificationTransportConfig}). Without it a relay that
   * simply does not advertise STARTTLS gets the account's password in the
   * clear, and nothing about the send would look wrong.
   *
   * The single reason it is configurable at all is the local SMTP capture
   * listener the acceptance test speaks to, which is a plain loopback socket.
   */
  readonly requireTls: boolean;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
  readonly fromName: string;
}

export type NotificationTransportConfig =
  | { readonly transport: 'RECORDING' }
  | { readonly transport: 'SMTP'; readonly smtp: SmtpTransportConfig };

function required(env: NodeJS.ProcessEnv, name: string): string {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${name} is not set.`);
  }
  return raw.trim();
}

/**
 * The password, read without trimming.
 *
 * Deliberately not passed through `required`: a password may legitimately begin
 * or end with whitespace, and silently trimming it produces an authentication
 * failure that looks like wrong credentials rather than like a mangled value.
 * Only emptiness is rejected, and the error names the variable alone.
 */
function requiredSecret(env: NodeJS.ProcessEnv, name: string): string {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    throw new Error(`${name} is not set.`);
  }
  return raw;
}

function booleanOf(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false".`);
}

function portOf(env: NodeJS.ProcessEnv, name: string): number {
  const raw = required(env, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return value;
}

/**
 * A minimal deliverability check on the sender address.
 *
 * Not an RFC 5322 parser and not trying to be: it exists so a deployment that
 * set `EMAIL_FROM_ADDRESS` to a display name, a URL or an empty template
 * placeholder fails at startup rather than at the first customer's checkout.
 */
function fromAddressOf(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) {
    throw new Error(`${name} must be a single email address.`);
  }
  if (/[\s<>,;]/.test(value)) {
    throw new Error(`${name} must not contain whitespace or address punctuation.`);
  }
  return value;
}

export function loadSmtpTransportConfig(
  env: NodeJS.ProcessEnv,
  { mustDeliver = false }: { mustDeliver?: boolean } = {},
): SmtpTransportConfig {
  const secure = booleanOf(env, 'SMTP_SECURE', false);
  const requireTls = booleanOf(env, 'SMTP_REQUIRE_TLS', true);

  // An unencrypted SMTP session sends the account password as base64 over a
  // plain socket. That is acceptable against a loopback capture listener and
  // never against anything else, so the escape hatch does not exist where it
  // would matter.
  if (mustDeliver && !secure && !requireTls) {
    throw new Error('SMTP_REQUIRE_TLS=false is refused in a delivering environment.');
  }

  return {
    host: required(env, 'SMTP_HOST'),
    port: portOf(env, 'SMTP_PORT'),
    secure,
    requireTls,
    username: required(env, 'SMTP_USERNAME'),
    password: requiredSecret(env, 'SMTP_PASSWORD'),
    fromAddress: fromAddressOf(env, 'EMAIL_FROM_ADDRESS'),
    fromName: required(env, 'EMAIL_FROM_NAME'),
  };
}

/**
 * Resolves the transport for this process, failing closed.
 *
 * @throws when the variable is unset, unknown, or `RECORDING` in an environment
 *   that must actually deliver.
 */
export function loadNotificationTransportConfig(
  env: NodeJS.ProcessEnv,
): NotificationTransportConfig {
  const nodeEnv = (env['NODE_ENV'] ?? '').trim().toLowerCase();
  const mustDeliver = DELIVERING_ENVIRONMENTS.includes(nodeEnv);
  const raw = env[NOTIFICATION_TRANSPORT_ENV];

  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      `${NOTIFICATION_TRANSPORT_ENV} is not set. ` +
        `Set it to one of: ${NOTIFICATION_TRANSPORTS.join(', ')}.`,
    );
  }

  const transport = raw.trim().toUpperCase();
  if (!(NOTIFICATION_TRANSPORTS as readonly string[]).includes(transport)) {
    throw new Error(
      `${NOTIFICATION_TRANSPORT_ENV} must be one of: ${NOTIFICATION_TRANSPORTS.join(', ')}.`,
    );
  }

  if (transport === 'RECORDING') {
    if (mustDeliver) {
      throw new Error(
        `${NOTIFICATION_TRANSPORT_ENV}=RECORDING is refused when NODE_ENV=${nodeEnv}: ` +
          'the recording adapter delivers to nobody. Configure SMTP.',
      );
    }
    return { transport: 'RECORDING' };
  }

  return { transport: 'SMTP', smtp: loadSmtpTransportConfig(env, { mustDeliver }) };
}
