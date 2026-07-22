import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { RequestContextService } from '../request-context/request-context.service';
import { createErrorEnvelope } from './api-envelope.factory';
import { mapExceptionToError } from './api-error-mapper';
import { ResponseClock } from './response-clock';

/**
 * Maps every unhandled exception to the canonical safe error envelope (D-034).
 *
 * `@Catch()` with no argument is deliberate: a filter that only caught
 * `HttpException` would let a driver error or a thrown string fall through to
 * Nest's default handler, which is precisely the path that exposes internals.
 *
 * The filter does not log. Structured logging and redaction are APP0-B05's, and
 * adding a `console.error` here would create a second, unredacted sink for the
 * very payloads this class exists to sanitise.
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
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const response: unknown = host.switchToHttp().getResponse();
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
  }
}
