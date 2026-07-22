import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, map } from 'rxjs';

import { RequestContextService } from '../request-context/request-context.service';
import {
  API_SUCCESS_META,
  SKIP_API_ENVELOPE,
  type ApiSuccessMeta,
} from './api-envelope.decorators';
import { createSuccessEnvelope, isEnvelopeFromFactory } from './api-envelope.factory';
import { ResponseClock } from './response-clock';

/** Structural response shape: avoids importing an HTTP-server type. */
interface StatusReadableResponse {
  readonly statusCode?: number;
}

/**
 * Wraps successful application responses in the canonical envelope (D-034).
 *
 * Correlation comes from the request context established in APP0-B02 — the
 * interceptor never reads the header again or generates an ID, so the body and
 * the gateway access log can never disagree about which request this was.
 */
@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
    private readonly clock: ResponseClock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || this.isExempt(context)) {
      return next.handle();
    }

    const successMeta = this.reflector.getAllAndOverride<ApiSuccessMeta | undefined>(
      API_SUCCESS_META,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((payload: unknown) => {
        if (!this.shouldWrap(context, payload)) {
          return payload;
        }
        return createSuccessEnvelope({
          data: payload ?? null,
          ...(successMeta === undefined ? {} : successMeta),
          requestId: this.requestContext.requireRequestId(),
          timestamp: this.clock.nowIso(),
        });
      }),
    );
  }

  /** `getAllAndOverride` lets a handler opt out without exempting its controller. */
  private isExempt(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(SKIP_API_ENVELOPE, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private shouldWrap(context: ExecutionContext, payload: unknown): boolean {
    // Binary and streaming bodies are handed to the adapter untouched; wrapping
    // one would replace the file with JSON describing it.
    if (payload instanceof StreamableFile || Buffer.isBuffer(payload)) {
      return false;
    }

    // 204 and 304 must not carry a body, and a HEAD response never does.
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    if (request.method === 'HEAD') {
      return false;
    }
    const status = context.switchToHttp().getResponse<StatusReadableResponse>().statusCode;
    if (status === HttpStatus.NO_CONTENT || status === HttpStatus.NOT_MODIFIED) {
      return false;
    }

    // A value that is already an envelope is passed through, so nothing is
    // nested twice. Identity is used rather than a `'success' in payload`
    // check, which would misfire on any domain object carrying a `success`
    // field of its own.
    return !isEnvelopeFromFactory(payload);
  }
}
