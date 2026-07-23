import type { RequestActorKind } from '../actor-context/request-actor';

/**
 * The structured log contract (APP0-B05).
 *
 * One record serialises to exactly one line of JSON. The shape is a locked
 * platform contract, not a free-form bag: callers supply an `event`, a `message`
 * and a bounded set of structured fields, and the platform owns everything a
 * caller must never be able to forge — the timestamp, level, service, request
 * correlation and actor view. No canonical log schema existed in the repository
 * before this checkpoint (`docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` §8 names
 * "structured logs" without a shape), so this is that minimal schema.
 */

/** Current schema version. Bumped only when the record shape changes. */
export const LOG_SCHEMA_VERSION = 1 as const;

/**
 * The single service name stamped on every record. The application is one
 * NestJS process (`@embroidery/api`); a stable short token keeps records
 * groupable without leaking the package version or topology.
 */
export const LOG_SERVICE_NAME = 'api' as const;

/** Severity levels, lowest to highest. Order also drives level filtering. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Numeric severity for threshold comparison; higher wins. */
export const LOG_LEVEL_SEVERITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Platform event taxonomy (APP0-B05).
 *
 * B05 owns platform lifecycle and transport events only. Business events
 * (`order.created`, `payment.failed`) belong to the feature that owns the rule
 * and must never be minted here. Names are lowercase, dot-separated and stable.
 */
export const PLATFORM_LOG_EVENT = {
  APPLICATION_LOG: 'application.log',
  HTTP_REQUEST_COMPLETED: 'http.request.completed',
  PLATFORM_ERROR: 'platform.error',
} as const;

/** Matches a stable, lowercase, dot-separated event name with no spaces. */
export const LOG_EVENT_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/;

/** Fallback event when a caller supplies a malformed one; logging never throws. */
export const FALLBACK_LOG_EVENT = 'platform.log';

/** Longest message retained on a record; longer input is truncated. */
export const MAX_LOG_MESSAGE_LENGTH = 2_000;

/** Longest `context` label retained on a record. */
export const MAX_LOG_CONTEXT_LENGTH = 200;

/** The safe actor projection carried by a log record. */
export interface LogActorView {
  readonly kind: RequestActorKind;
  readonly id?: string;
}

/**
 * Transport facts for an HTTP request. `durationMs` is present only on a
 * completion record — an error record captures the method, route and status but
 * has no meaningful duration of its own.
 */
export interface LogHttpFields {
  readonly method: string;
  readonly route: string;
  readonly statusCode: number;
  readonly durationMs?: number;
}

/** The redacted summary of an error; never the raw exception. */
export interface LogErrorFields {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
}

/**
 * A fully assembled log record.
 *
 * Reserved fields (`schemaVersion`, `timestamp`, `level`, `service`,
 * `requestId`, `actor`) are set by the platform and can never be supplied by a
 * caller: caller-provided data lives only under `attributes`, after redaction.
 */
export interface LogRecord {
  readonly schemaVersion: typeof LOG_SCHEMA_VERSION;
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: typeof LOG_SERVICE_NAME;
  readonly event: string;
  readonly message: string;
  readonly context?: string;
  readonly requestId?: string;
  readonly actor?: LogActorView;
  readonly http?: LogHttpFields;
  readonly error?: LogErrorFields;
  readonly attributes?: Record<string, unknown>;
}
