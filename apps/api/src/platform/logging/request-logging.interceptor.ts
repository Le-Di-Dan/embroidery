import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

import { RequestContextService } from '../request-context/request-context.service';
import { PLATFORM_LOG_EVENT, type LogLevel } from './log-record';
import { safeMethod, safeRoute, type RoutableRequest } from './safe-route';
import { StructuredLogger } from './structured-logger.service';

/** The response fields we read; structural to avoid an HTTP-server import. */
interface CompletableResponse {
  readonly statusCode?: number;
  once(event: string, listener: () => void): unknown;
}

const CLIENT_ERROR_STATUS = 400;

/**
 * Emits exactly one `http.request.completed` record per request (APP0-B05).
 *
 * The record is written from the response `finish` event rather than the RxJS
 * stream so it always carries the *final* status the exception filter settled
 * on, for both success and error paths, and is emitted once. The async context
 * is captured with `AsyncLocalStorage.snapshot()` at interception time and
 * restored inside the `finish` callback, so the request id and — crucially — an
 * actor bound *after* interception are both visible when the record is built.
 *
 * It reads the request and never writes to the response: it adds no header,
 * consumes no stream and does not alter the body. Duration is measured with a
 * monotonic clock; the wall-clock timestamp comes from the logger.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RoutableRequest>();
    const response = http.getResponse<CompletableResponse>();
    const startedAt = performance.now();
    // Capture the context now so the actor bound during the handler is visible
    // when `finish` fires, well after this synchronous body has returned.
    const restoreContext = AsyncLocalStorage.snapshot();
    let logged = false;

    response.once('finish', () => {
      if (logged) {
        return;
      }
      logged = true;
      restoreContext(() => {
        this.emitCompletion(request, response.statusCode ?? 0, performance.now() - startedAt);
      });
    });

    return next.handle();
  }

  private emitCompletion(request: RoutableRequest, statusCode: number, durationMs: number): void {
    this.logger.emit(
      levelForStatus(statusCode),
      PLATFORM_LOG_EVENT.HTTP_REQUEST_COMPLETED,
      'HTTP request completed',
      {
        http: {
          method: safeMethod(request),
          route: safeRoute(request),
          statusCode,
          durationMs: roundDuration(durationMs),
        },
      },
    );
  }
}

/**
 * A completed 4xx or 5xx is `warn`, not `error`: an unknown 5xx already emits a
 * dedicated `platform.error` record from the exception filter, so raising the
 * completion record to error too would double-count the failure.
 */
function levelForStatus(statusCode: number): LogLevel {
  return statusCode >= CLIENT_ERROR_STATUS ? 'warn' : 'info';
}

function roundDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 0;
  }
  return Math.round(durationMs * 1000) / 1000;
}
