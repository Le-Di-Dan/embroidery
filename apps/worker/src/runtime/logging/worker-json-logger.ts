/**
 * The worker's structured log sink (`APP12-H03` §12, §13 — correlation
 * hardening).
 *
 * ## The gap this closes
 *
 * `APP0-B05` gave the API a one-line-JSON log record and `api/main.ts` routes
 * Nest's own logger through it, so every API line — framework, lifecycle and
 * application alike — is a single JSON object. The worker never got the
 * equivalent. It composes correct JSON for its job fields
 * (`formatJobLogLine`) and then hands it to Nest's default logger, which wraps
 * it in a coloured, bracketed, ANSI-escaped text line.
 *
 * That was invisible while the only reader was a developer's terminal. It stops
 * being invisible the moment the lines go to Loki: `| json` parses the API's
 * records and fails on the worker's, so "follow this journey across the two
 * services" works on one side and not the other. §2 lists **correlation
 * hardening** as something this checkpoint may add, and this is that.
 *
 * ## What it deliberately is not
 *
 * Not a second logging platform. It is a `LoggerService` adapter, roughly forty
 * lines, that emits the same field names the API's `LogRecord` uses so a single
 * Loki query spans both. It re-implements no redaction: the worker's own
 * `projectJobLogFields` is already an **allow-list** — payloads, object bytes,
 * credentials and stack traces are not in it — and this preserves that by
 * merging a job-fields JSON message rather than re-serialising anything.
 *
 * A message that is *not* JSON is carried verbatim under `message`, which is
 * where every framework line ends up.
 */
import type { LoggerService, LogLevel } from '@nestjs/common';

/** Matches `LOG_SCHEMA_VERSION` in the API's platform log record. */
const LOG_SCHEMA_VERSION = 1;

const SERVICE = 'worker';

/** Longest retained message. Matches the API's `MAX_LOG_MESSAGE_LENGTH`. */
const MAX_MESSAGE_LENGTH = 2_000;

/** Nest's levels, projected onto the API's four. */
const LEVEL_OF: Readonly<Record<string, string>> = {
  log: 'info',
  verbose: 'debug',
  debug: 'debug',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

interface JobFieldsMessage {
  readonly correlationId?: unknown;
  readonly jobKind?: unknown;
  readonly jobKey?: unknown;
}

/**
 * `true` when the parsed message is the worker's own job-fields projection.
 *
 * Checked structurally rather than by trusting any JSON: an arbitrary object
 * that happened to parse would be merged into the record's top level, which is
 * how a payload gets into a log line. Only a shape carrying the three
 * correlation fields is merged; everything else stays a string.
 */
function isJobFields(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as JobFieldsMessage;
  return (
    typeof candidate.correlationId === 'string' &&
    typeof candidate.jobKind === 'string' &&
    typeof candidate.jobKey === 'string'
  );
}

function truncate(text: string): string {
  return text.length <= MAX_MESSAGE_LENGTH ? text : text.slice(0, MAX_MESSAGE_LENGTH);
}

function textOf(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  // Never `JSON.stringify` an arbitrary object into a log line: an object a
  // caller passed could be a payload. Its type is enough to say what happened.
  return `[${typeof message}]`;
}

export class WorkerJsonLogger implements LoggerService {
  private readonly stream = { info: process.stdout, error: process.stderr };

  log(message: unknown, context?: unknown): void {
    this.emit('log', message, context);
  }

  error(message: unknown, ...rest: unknown[]): void {
    // Nest calls `error(message, stack, context)`. The stack is dropped rather
    // than logged: `LOG_STACK_ENABLED` is false in production for the API and
    // the worker has no reason to be looser.
    this.emit('error', message, rest[rest.length - 1]);
  }

  warn(message: unknown, context?: unknown): void {
    this.emit('warn', message, context);
  }

  debug(message: unknown, context?: unknown): void {
    this.emit('debug', message, context);
  }

  verbose(message: unknown, context?: unknown): void {
    this.emit('verbose', message, context);
  }

  fatal(message: unknown, context?: unknown): void {
    this.emit('fatal', message, context);
  }

  setLogLevels(_levels: LogLevel[]): void {
    // Level filtering stays with Nest's own bootstrap options; this sink writes
    // what it is given.
  }

  private emit(level: string, message: unknown, context: unknown): void {
    const text = truncate(textOf(message));
    let jobFields: Record<string, unknown> | undefined;
    if (text.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (isJobFields(parsed)) {
          jobFields = parsed;
        }
      } catch {
        // Not JSON. It stays the message, which is the right answer.
      }
    }

    const record = {
      schemaVersion: LOG_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      level: LEVEL_OF[level] ?? 'info',
      service: SERVICE,
      event: jobFields === undefined ? 'application.log' : 'worker.job.completed',
      message: jobFields === undefined ? text : 'Job attempt completed',
      ...(typeof context === 'string' ? { context } : {}),
      ...(jobFields ?? {}),
    };

    const stream =
      record.level === 'error' || record.level === 'warn' ? this.stream.error : this.stream.info;
    stream.write(`${JSON.stringify(record)}\n`);
  }
}
