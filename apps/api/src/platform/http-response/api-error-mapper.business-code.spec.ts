import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { mapExceptionToError } from './api-error-mapper';

describe('api-error-mapper — business code and 415 (APP1-B01)', () => {
  it('surfaces a safe business code from the exception payload', () => {
    const mapped = mapExceptionToError(
      new UnauthorizedException({
        code: 'STAFF_LOGIN_FAILED',
        message: 'Invalid email or password.',
      }),
    );
    expect(mapped.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(mapped.code).toBe('STAFF_LOGIN_FAILED');
    expect(mapped.message).toBe('Invalid email or password.');
  });

  it('ignores a code that does not look like a stable business code', () => {
    const mapped = mapExceptionToError(
      new BadRequestException({ code: 'not a code!', message: 'bad' }),
    );
    expect(mapped.code).toBe('BAD_REQUEST');
  });

  it('maps 415 to UNSUPPORTED_MEDIA_TYPE', () => {
    const mapped = mapExceptionToError(new UnsupportedMediaTypeException());
    expect(mapped.status).toBe(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    expect(mapped.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('still replaces a 5xx code and message regardless of payload', () => {
    const mapped = mapExceptionToError(
      new HttpException({ code: 'LEAKY_CODE', message: 'internal detail' }, 500),
    );
    expect(mapped.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mapped.message).not.toContain('internal detail');
  });

  it('preserves field errors alongside a business code', () => {
    const mapped = mapExceptionToError(
      new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'The request is invalid.',
        errors: [{ field: 'email', code: 'REQUIRED', message: 'Email is required.' }],
      }),
    );
    expect(mapped.errors).toEqual([
      { field: 'email', code: 'REQUIRED', message: 'Email is required.' },
    ]);
  });
});
