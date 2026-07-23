import { Inject, Injectable, type LoggerService } from '@nestjs/common';

import { PLATFORM_LOG_EVENT } from './log-record';
import type { LogRecordFields } from './log-record.factory';
import { StructuredLogger } from './structured-logger.service';
import { LOGGING_CONFIG, type LoggingConfig } from './logging-config';

/**
 * Routes NestJS framework and bootstrap logs through the structured logger
 * (APP0-B05).
 *
 * Wiring this via `app.useLogger()` in the runtime entry point turns Nest's own
 * output (startup, shutdown, route mapping) into the same one-line JSON as
 * everything else, instead of leaving a second free-form console format in the
 * process. Nest's variadic signatures are mapped conservatively: the trailing
 * `context` string is treated as a bounded label, an error `trace` is only
 * included when stack logging is enabled and is redacted as an ordinary field,
 * and a non-string message is never dumped raw.
 */
@Injectable()
export class NestLoggerAdapter implements LoggerService {
  constructor(
    private readonly logger: StructuredLogger,
    @Inject(LOGGING_CONFIG) private readonly config: LoggingConfig,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(PLATFORM_LOG_EVENT.APPLICATION_LOG, coerceMessage(message), {
      context: contextOf(optionalParams),
    });
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(PLATFORM_LOG_EVENT.APPLICATION_LOG, coerceMessage(message), {
      context: contextOf(optionalParams),
    });
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(PLATFORM_LOG_EVENT.APPLICATION_LOG, coerceMessage(message), {
      context: contextOf(optionalParams),
    });
  }

  /** Nest treats `verbose` as more detailed than debug; folded onto debug here. */
  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(PLATFORM_LOG_EVENT.APPLICATION_LOG, coerceMessage(message), {
      context: contextOf(optionalParams),
    });
  }

  /** Nest's most severe level; mapped to the platform's `error`. */
  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(PLATFORM_LOG_EVENT.PLATFORM_ERROR, coerceMessage(message), {
      context: contextOf(optionalParams),
    });
  }

  /** `error(message, trace?, context?)`: the trace is gated and redacted. */
  error(message: unknown, ...optionalParams: unknown[]): void {
    const fields: LogRecordFields = {
      context: contextOf(optionalParams),
      ...this.traceAttributes(optionalParams),
    };
    this.logger.error(PLATFORM_LOG_EVENT.PLATFORM_ERROR, coerceMessage(message), fields);
  }

  private traceAttributes(optionalParams: readonly unknown[]): Pick<LogRecordFields, 'attributes'> {
    if (!this.config.stackEnabled) {
      return {};
    }
    const [trace] = optionalParams;
    // The trace string is redacted by the sanitiser like any other attribute.
    return typeof trace === 'string' && trace.length > 0 ? { attributes: { trace } } : {};
  }
}

const MAX_COERCED_MESSAGE_LENGTH = 500;

function coerceMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  return `[${typeof message}]`;
}

/** Nest passes the context as the final string argument, when present. */
function contextOf(optionalParams: readonly unknown[]): string | undefined {
  const last = optionalParams.at(-1);
  return typeof last === 'string' && last.length > 0 && last.length <= MAX_COERCED_MESSAGE_LENGTH
    ? last
    : undefined;
}
