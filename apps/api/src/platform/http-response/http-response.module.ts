import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { LoggingModule } from '../logging/logging.module';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiResponseInterceptor } from './api-response.interceptor';
import { ResponseClock } from './response-clock';

/**
 * Registers the platform response contract globally (APP0-B03).
 *
 * `APP_INTERCEPTOR` and `APP_FILTER` are used instead of `app.useGlobalX()` in
 * `main.ts` so both components participate in dependency injection — they need
 * `RequestContextService` and `Reflector` — and so the runtime application, the
 * OpenAPI generator and every test application get identical behaviour from the
 * same module rather than from bootstrap code only one of them runs.
 *
 * `RequestContextService` is resolved from the global `RequestContextModule`
 * (APP0-B02), whose middleware runs before any interceptor or filter, so the
 * request ID is always established by the time an envelope is built.
 */
@Module({
  imports: [LoggingModule],
  providers: [
    ResponseClock,
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
  exports: [ResponseClock],
})
export class HttpResponseModule {}
