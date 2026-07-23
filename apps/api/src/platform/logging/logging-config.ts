import { LOG_LEVELS, type LogLevel } from './log-record';

/**
 * Startup configuration for structured logging (APP0-B05).
 *
 * Validated at load like the rest of the app config (BACKEND_CONVENTIONS §16):
 * an invalid level fails fast rather than falling back silently, and the
 * security-sensitive defaults (production emits no debug logs and no stack
 * traces) are applied by environment when the operator sets nothing. It reads no
 * secret and names no remote endpoint.
 */
export interface LoggingConfig {
  readonly level: LogLevel;
  readonly stackEnabled: boolean;
}

/** DI token for the resolved logging configuration. */
export const LOGGING_CONFIG = Symbol('LOGGING_CONFIG');

const PRODUCTION = 'production';

function defaultLevel(nodeEnv: string | undefined): LogLevel {
  return nodeEnv === PRODUCTION ? 'info' : 'debug';
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

function parseLevel(raw: string | undefined, nodeEnv: string | undefined): LogLevel {
  if (raw === undefined || raw === '') {
    return defaultLevel(nodeEnv);
  }
  const normalized = raw.toLowerCase();
  if (isLogLevel(normalized)) {
    return normalized;
  }
  throw new Error(`Invalid LOG_LEVEL "${raw}": expected one of ${LOG_LEVELS.join(', ')}.`);
}

function parseStackEnabled(raw: string | undefined, nodeEnv: string | undefined): boolean {
  if (raw === undefined || raw === '') {
    // Off in production so a stack can never reach a production log by default.
    return nodeEnv !== PRODUCTION;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`Invalid LOG_STACK_ENABLED "${raw}": expected "true" or "false".`);
}

export function loadLoggingConfig(env: NodeJS.ProcessEnv): LoggingConfig {
  const nodeEnv = env['NODE_ENV'];
  return {
    level: parseLevel(env['LOG_LEVEL'], nodeEnv),
    stackEnabled: parseStackEnabled(env['LOG_STACK_ENABLED'], nodeEnv),
  };
}
