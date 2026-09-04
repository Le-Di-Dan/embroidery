/**
 * The API metrics platform (`APP12-H03` §6, §10).
 *
 * Global, like logging and request context, because instrumentation is a
 * platform concern: a use case in any module injects a recorder without its
 * module having to import anything, which is what keeps the instrumentation
 * edit in a 300-line use case down to a constructor parameter and two calls.
 *
 * The HTTP interceptor is registered here as an `APP_INTERCEPTOR` rather than
 * from bootstrap, so it applies uniformly to the runtime application and to
 * every integration-test application — the tests that prove exact counts (§22)
 * need the same boundary the process uses, not a second one.
 *
 * **No controller.** The scrape is served by a separate `node:http` listener on
 * its own port, started from `main.ts`. That is what keeps the metrics surface
 * out of the OpenAPI document, off the Gateway, and outside the business
 * request pipeline (§2, §10).
 */
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import {
  ApiCommerceMetrics,
  ApiDependencyMetrics,
  ApiHttpMetrics,
  METRIC_REGISTRY,
  createApiMetricRegistry,
} from './api-metrics.providers';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Global()
@Module({
  providers: [
    { provide: METRIC_REGISTRY, useFactory: createApiMetricRegistry },
    ApiHttpMetrics,
    ApiCommerceMetrics,
    ApiDependencyMetrics,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [METRIC_REGISTRY, ApiHttpMetrics, ApiCommerceMetrics, ApiDependencyMetrics],
})
export class MetricsModule {}
