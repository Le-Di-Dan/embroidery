import type { RequestActor } from '../actor-context/request-actor';
import { toActorLogView } from './actor-log-view';
import { sanitizeAttributes } from './log-sanitizer';
import {
  FALLBACK_LOG_EVENT,
  LOG_EVENT_PATTERN,
  LOG_SCHEMA_VERSION,
  LOG_SERVICE_NAME,
  MAX_LOG_CONTEXT_LENGTH,
  MAX_LOG_MESSAGE_LENGTH,
  type LogErrorFields,
  type LogHttpFields,
  type LogLevel,
  type LogRecord,
} from './log-record';

/** Top-level names a caller can never set through `attributes`. */
const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'schemaVersion',
  'timestamp',
  'level',
  'service',
  'event',
  'message',
  'context',
  'requestId',
  'actor',
  'http',
  'error',
  'attributes',
]);

/** Structured, already-trusted fields the platform sets on a record. */
export interface LogRecordFields {
  readonly context?: string | undefined;
  readonly http?: LogHttpFields | undefined;
  readonly error?: LogErrorFields | undefined;
  readonly attributes?: Record<string, unknown> | undefined;
}

/** Everything needed to assemble one record; correlation is passed in, not read. */
export interface BuildLogRecordInput {
  readonly level: LogLevel;
  readonly event: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly requestId?: string | undefined;
  readonly actor?: RequestActor | undefined;
  readonly fields?: LogRecordFields | undefined;
}

/**
 * Assembles a `LogRecord` from trusted correlation and caller-provided fields
 * (APP0-B05).
 *
 * Pure and framework-free so the record shape can be asserted without an
 * application: the caller supplies the request id and actor (the logger service
 * reads them from context), and this function is responsible only for shaping,
 * bounding and stripping. Reserved fields cannot be overridden — caller
 * attributes are namespaced under `attributes` and any reserved key among them
 * is dropped.
 */
export function buildLogRecord(input: BuildLogRecordInput): LogRecord {
  const attributes = sanitizeAttributes(input.fields?.attributes, RESERVED_FIELD_NAMES);
  const context = normalizeContext(input.fields?.context);
  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    timestamp: input.timestamp.toISOString(),
    level: input.level,
    service: LOG_SERVICE_NAME,
    event: normalizeEvent(input.event),
    message: boundMessage(input.message),
    ...(context === undefined ? {} : { context }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.actor === undefined ? {} : { actor: toActorLogView(input.actor) }),
    ...(input.fields?.http === undefined ? {} : { http: input.fields.http }),
    ...(input.fields?.error === undefined ? {} : { error: input.fields.error }),
    ...(attributes === undefined ? {} : { attributes }),
  };
}

function normalizeEvent(event: string): string {
  return LOG_EVENT_PATTERN.test(event) ? event : FALLBACK_LOG_EVENT;
}

function boundMessage(message: string): string {
  const single = message.replace(/[\r\n]+/g, ' ');
  return single.length <= MAX_LOG_MESSAGE_LENGTH
    ? single
    : `${single.slice(0, MAX_LOG_MESSAGE_LENGTH)}[Truncated]`;
}

function normalizeContext(context: string | undefined): string | undefined {
  if (context === undefined || context === '') {
    return undefined;
  }
  const single = context.replace(/[\r\n]+/g, ' ');
  return single.length <= MAX_LOG_CONTEXT_LENGTH ? single : single.slice(0, MAX_LOG_CONTEXT_LENGTH);
}
