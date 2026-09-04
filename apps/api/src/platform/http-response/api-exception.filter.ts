import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { isPersistenceError } from '@embroidery/database';
import type { MetricDependency } from '@embroidery/observability';
import { ObjectStorageError } from '@embroidery/object-storage';

import { summarizeError } from '../logging/log-error';
import { PLATFORM_LOG_EVENT } from '../logging/log-record';
import { safeMethod, safeRoute, type RoutableRequest } from '../logging/safe-route';
import { LOGGING_CONFIG, type LoggingConfig } from '../logging/logging-config';
import { StructuredLogger } from '../logging/structured-logger.service';
import { ApiDependencyMetrics } from '../metrics/api-metrics.providers';
import { metricRouteTemplate } from '../metrics/metric-route';
import { RequestContextService } from '../request-context/request-context.service';
import { createErrorEnvelope } from './api-envelope.factory';
import { mapExceptionToError } from './api-error-mapper';
import { ResponseClock } from './response-clock';

/**
 * Names the infrastructure dependency an exception came from, or `undefined`.
 *
 * Two dependencies, recognised by their own error types and by nothing else.
 * A heuristic on the message would be wrong in both directions — a business
 * error mentioning "connection" would be counted, and a driver error with an
 * unexpected message would not.
 */
function classifyDependencyFailure(exception: unknown): MetricDependency | undefined {
  if (isPersistenceError(exception)) {
    return 'database';
  }
  if (exception instanceof ObjectStorageError) {
    return 'object_storage';
  }
  return undefined;
}

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
    private readonly metrics: ApiDependencyMetrics,
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
      const request = http.getRequest<RoutableRequest>();
      this.logInternalError(exception, mapped.status, request);
      this.countDependencyError(exception, request);
    }
  }

  /**
   * Counts an infrastructure failure at the boundary it surfaced from
   * (`APP12-H03` §9).
   *
   * Only the two dependencies §9 names, and only when the exception says so —
   * a `PersistenceError` or an `ObjectStorageError`. An unrecognised fault is
   * already counted by the HTTP 5xx family and by whichever commerce metric
   * owns the seam; guessing a dependency for it would report a database
   * incident that may have nothing to do with the database.
   *
   * `operation` carries the **route template**, which is bounded by the same
   * rule as `route_template` and answers the only question this counter is
   * for: which endpoint's infrastructure call is failing. §9 forbids labelling
   * by SQL or by a query carrying parameters, and a route template is neither.
   */
  private countDependencyError(exception: unknown, request: RoutableRequest): void {
    try {
      const dependency = classifyDependencyFailure(exception);
      if (dependency !== undefined) {
        this.metrics.recordDependencyError(dependency, metricRouteTemplate(request));
      }
    } catch {
      // Telemetry must never turn a handled error into a second failure.
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
