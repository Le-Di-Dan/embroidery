import { Inject, Injectable } from '@nestjs/common';

import { RequestContextService } from '../request-context/request-context.service';
import { LogClock } from './log-clock';
import { buildLogRecord, type LogRecordFields } from './log-record.factory';
import { LOG_LEVEL_SEVERITY, type LogLevel } from './log-record';
import { LOG_SINK, type LogSink } from './log-sink';
import { LOGGING_CONFIG, type LoggingConfig } from './logging-config';

/**
 * The application's structured logger (APP0-B05).
 *
 * Callers pass a stable `event`, a `message` and an optional bag of structured
 * fields; everything a caller must not forge — timestamp, level, service, and
 * the request/actor correlation — is supplied here. Correlation is read from the
 * B02 request context and B04 actor at emit time, so a log written mid-request
 * is automatically stamped with the same request id the envelope carries and the
 * actor bound so far. Outside a request it simply omits those fields rather than
 * inventing a correlation id or an actor.
 *
 * It never throws: a level below the configured threshold is dropped, and the
 * sink absorbs any serialisation failure.
 */
@Injectable()
export class StructuredLogger {
  private readonly threshold: number;

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly clock: LogClock,
    @Inject(LOG_SINK) private readonly sink: LogSink,
    @Inject(LOGGING_CONFIG) config: LoggingConfig,
  ) {
    this.threshold = LOG_LEVEL_SEVERITY[config.level];
  }

  debug(event: string, message: string, fields?: LogRecordFields): void {
    this.emit('debug', event, message, fields);
  }

  info(event: string, message: string, fields?: LogRecordFields): void {
    this.emit('info', event, message, fields);
  }

  warn(event: string, message: string, fields?: LogRecordFields): void {
    this.emit('warn', event, message, fields);
  }

  error(event: string, message: string, fields?: LogRecordFields): void {
    this.emit('error', event, message, fields);
  }

  /**
   * Assembles and writes one record, or drops it when below the level threshold.
   *
   * Correlation is read defensively: `getRequestId()`/`getActor()` return
   * `undefined` outside a request, and those fields are then simply absent — a
   * startup log is valid without a request id.
   */
  emit(level: LogLevel, event: string, message: string, fields?: LogRecordFields): void {
    if (LOG_LEVEL_SEVERITY[level] < this.threshold) {
      return;
    }
    const record = buildLogRecord({
      level,
      event,
      message,
      timestamp: this.clock.now(),
      requestId: this.requestContext.getRequestId(),
      actor: this.requestContext.getActor(),
      fields,
    });
    this.sink.write(record);
  }
}
