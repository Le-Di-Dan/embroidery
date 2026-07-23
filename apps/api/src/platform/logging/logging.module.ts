import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { LogClock } from './log-clock';
import { LOG_SINK, StdoutLogSink } from './log-sink';
import { LOGGING_CONFIG, loadLoggingConfig } from './logging-config';
import { NestLoggerAdapter } from './nest-logger.adapter';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { StructuredLogger } from './structured-logger.service';

/**
 * Structured logging platform (APP0-B05).
 *
 * Global so any module can inject `StructuredLogger` without re-importing this
 * module — logging is a platform concern, like request context. The request
 * completion interceptor is registered here as a global `APP_INTERCEPTOR` so it
 * participates in DI (it needs the context service and the logger) and applies
 * uniformly to the runtime application and every test application, rather than
 * from bootstrap code only the process runs.
 *
 * The runtime implementation is deliberately API-local. The shared
 * `@embroidery/observability` package resolves its `main` to raw TypeScript
 * source and has no build output; importing values from it at runtime would
 * reproduce the IMP-D018 failure that crashed the API container. Extracting the
 * pure primitives once that package is made runtime-loadable is a recorded
 * follow-up, not this checkpoint's work.
 */
@Global()
@Module({
  providers: [
    LogClock,
    StructuredLogger,
    NestLoggerAdapter,
    { provide: LOG_SINK, useClass: StdoutLogSink },
    { provide: LOGGING_CONFIG, useFactory: () => loadLoggingConfig(process.env) },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
  exports: [StructuredLogger, NestLoggerAdapter, LogClock, LOG_SINK, LOGGING_CONFIG],
})
export class LoggingModule {}
