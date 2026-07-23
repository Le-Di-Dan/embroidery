import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { summarizeError } from '../logging/log-error';
import { PLATFORM_LOG_EVENT } from '../logging/log-record';
import { safeMethod, safeRoute, type RoutableRequest } from '../logging/safe-route';
import { LOGGING_CONFIG, type LoggingConfig } from '../logging/logging-config';
import { StructuredLogger } from '../logging/structured-logger.service';
import { RequestContextService } from '../request-context/request-context.service';
import { createErrorEnvelope } from './api-envelope.factory';
import { mapExceptionToError } from './api-error-mapper';
import { ResponseClock } from './response-clock';

/** Lowest status that is a server fault, typed as a number for status comparison. */
const SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Maps every unhandled exception to the canonical safe error envelope (D-034).
 *
 * `@Catch()` with no argument is deliberate: a filter that only caught
 * `HttpException` would let a driver error or a thrown string fall through to
 * Nest's default handler, which is precisely the path that exposes internals.
 *
 * Since APP0-B05 the filter emits one structured internal-error log for an
 * unknown/5xx failure (redacted, via `StructuredLogger`) — never a raw
 * `console.error` of the exception, which is exactly the unredacted sink this
 * class exists to prevent. A known 4xx is not logged as an error here: its
 * completion is already captured by the request interceptor. Logging is best
 * effort and must never replace the public response, so it runs after the reply
 * and its own failure is swallowed.
 *
 * It uses `HttpAdapterHost` rather than the Express response type so the filter
 * does not couple the platform layer to one HTTP adapter.
 */
@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly requestContext: RequestContextService,
    private readonly clock: ResponseClock,
    private readonly logger: StructuredLogger,
    @Inject(LOGGING_CONFIG) private readonly loggingConfig: LoggingConfig,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const response: unknown = http.getResponse();
    const mapped = mapExceptionToError(exception);

    // Once headers are sent the body is already committed; writing again would
    // corrupt the response rather than improve it.
    if (httpAdapter.isHeadersSent(response)) {
      return;
    }

    const envelope = createErrorEnvelope({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.errors === undefined ? {} : { errors: mapped.errors }),
      // Correlation comes from the context APP0-B02 established. The filter
      // never generates an ID: an error response carrying an ID that appears in
      // no access log would be actively misleading during an incident.
      requestId: this.requestContext.requireRequestId(),
      timestamp: this.clock.nowIso(),
    });

    httpAdapter.reply(response, envelope, mapped.status);

    // The public response is already sent; internal logging is additive and must
    // not turn a handled error into a new failure.
    if (mapped.status >= SERVER_ERROR_STATUS) {
      this.logInternalError(exception, mapped.status, http.getRequest<RoutableRequest>());
    }
  }

  private logInternalError(exception: unknown, statusCode: number, request: RoutableRequest): void {
    try {
      this.logger.error(PLATFORM_LOG_EVENT.PLATFORM_ERROR, 'Unhandled request error', {
        error: summarizeError(exception, this.loggingConfig.stackEnabled),
        http: {
          method: safeMethod(request),
          route: safeRoute(request),
          statusCode,
        },
      });
    } catch {
      // A logging failure must never propagate past a response already sent.
    }
  }
}
