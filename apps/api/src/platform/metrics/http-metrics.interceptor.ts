/**
 * The single HTTP instrumentation boundary (`APP12-H03` §6).
 *
 * One global interceptor, counting once per request from the response `finish`
 * event — the same seam `RequestLoggingInterceptor` uses, and for the same
 * reason: it is the only point that sees the **final** status the exception
 * filter settled on, for the success and the error path alike, and it fires
 * exactly once.
 *
 * §6 warns against double-counting a request at the controller, the service and
 * the gateway. There is exactly one counter in this application and it is here.
 * The Gateway is not instrumented at all, so `embroidery_http_requests_total`
 * has one and only one producer per API pod.
 *
 * The route is read at `finish` rather than at interception, because Express
 * populates `request.route` when a handler matches — which has not happened yet
 * when `intercept` returns. Reading it early would make every template `other`.
 */
import { performance } from 'node:perf_hooks';

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { statusClass } from '@embroidery/observability';
import type { Observable } from 'rxjs';

import type { RoutableRequest } from '../logging/safe-route';
import { ApiHttpMetrics } from './api-metrics.providers';
import { isExcludedFromHttpMetrics, metricMethod, metricRouteTemplate } from './metric-route';

/** The response fields we read; structural, to avoid an HTTP-server import. */
interface CompletableResponse {
  readonly statusCode?: number;
  once(event: string, listener: () => void): unknown;
}

const MILLISECONDS_PER_SECOND = 1000;

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: ApiHttpMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RoutableRequest>();
    const response = http.getResponse<CompletableResponse>();
    const startedAt = performance.now();
    this.metrics.requestStarted();
    let recorded = false;

    response.once('finish', () => {
      if (recorded) {
        return;
      }
      recorded = true;
      const routeTemplate = metricRouteTemplate(request);
      const durationSeconds = (performance.now() - startedAt) / MILLISECONDS_PER_SECOND;
      if (isExcludedFromHttpMetrics(routeTemplate)) {
        // Still balances the in-flight gauge — a probe that is not counted must
        // not leave the gauge permanently high.
        this.metrics.requestCompletedExcluded();
        return;
      }
      this.metrics.requestCompleted({
        method: metricMethod(request),
        routeTemplate,
        statusClass: statusClass(response.statusCode ?? 0),
        durationSeconds,
      });
    });

    // A response that never emits `finish` — an aborted connection — would
    // otherwise leak the in-flight gauge. `close` always fires.
    (response as unknown as { once(event: string, listener: () => void): unknown }).once(
      'close',
      () => {
        if (recorded) {
          return;
        }
        recorded = true;
        this.metrics.requestCompletedExcluded();
      },
    );

    return next.handle();
  }
}
