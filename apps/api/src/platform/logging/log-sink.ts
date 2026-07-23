import { Injectable } from '@nestjs/common';

import { LOG_LEVEL_SEVERITY, LOG_SERVICE_NAME, type LogRecord } from './log-record';

/**
 * The destination for assembled log records (APP0-B05).
 *
 * An interface, not a bare `console` call, so the sink is swappable and — most
 * importantly — capturable in tests without monkey-patching a process-global
 * stream. B05 ships exactly one implementation: newline-delimited JSON on the
 * standard streams. No file, remote or vendor transport exists.
 */
export interface LogSink {
  write(record: LogRecord): void;
}

/** DI token for the active sink. */
export const LOG_SINK = Symbol('LOG_SINK');

/** Warn and above go to stderr; the rest to stdout, matching operator convention. */
const STDERR_THRESHOLD = LOG_LEVEL_SEVERITY.warn;

/**
 * Writes one JSON object per line to the standard streams.
 *
 * Serialisation is expected to succeed because records are already sanitised,
 * but a defensive fallback guarantees the sink itself can never throw or emit
 * partial JSON: on failure it writes a minimal, valid record instead of the
 * offending one and never recurses into the sanitiser again.
 */
@Injectable()
export class StdoutLogSink implements LogSink {
  write(record: LogRecord): void {
    const line = this.serialize(record);
    const stream =
      LOG_LEVEL_SEVERITY[record.level] >= STDERR_THRESHOLD ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }

  private serialize(record: LogRecord): string {
    try {
      return JSON.stringify(record);
    } catch {
      return JSON.stringify({
        schemaVersion: record.schemaVersion,
        timestamp: record.timestamp,
        level: record.level,
        service: LOG_SERVICE_NAME,
        event: 'platform.log',
        message: 'A log record could not be serialised and was dropped.',
        ...(record.requestId === undefined ? {} : { requestId: record.requestId }),
      });
    }
  }
}
