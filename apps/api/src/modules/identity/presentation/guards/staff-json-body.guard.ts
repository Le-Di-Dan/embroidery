/**
 * JSON-only content-type guard for the staff login body (ADR-APP1-001 §6, §17).
 *
 * Blocks cross-site HTML form posts by requiring `application/json`; anything
 * else is rejected with 415 before the body is read. Applied to login only —
 * logout carries no body.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { RequestOriginPolicy } from '../../infrastructure/http/request-origin.policy';

@Injectable()
export class StaffJsonBodyGuard implements CanActivate {
  constructor(private readonly policy: RequestOriginPolicy) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    if (!this.policy.isJsonContentType(request)) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Only application/json is accepted.',
      });
    }
    return true;
  }
}
