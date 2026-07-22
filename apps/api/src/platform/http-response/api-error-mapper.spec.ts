import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { API_ERROR_CODE, INTERNAL_ERROR_MESSAGE, errorCodeForStatus } from './api-error-code';
import { mapExceptionToError } from './api-error-mapper';

describe('errorCodeForStatus', () => {
  it.each([
    [400, API_ERROR_CODE.BAD_REQUEST],
    [401, API_ERROR_CODE.UNAUTHORIZED],
    [403, API_ERROR_CODE.FORBIDDEN],
    [404, API_ERROR_CODE.NOT_FOUND],
    [405, API_ERROR_CODE.METHOD_NOT_ALLOWED],
    [409, API_ERROR_CODE.CONFLICT],
    [422, API_ERROR_CODE.UNPROCESSABLE_ENTITY],
    [429, API_ERROR_CODE.TOO_MANY_REQUESTS],
    [500, API_ERROR_CODE.INTERNAL_SERVER_ERROR],
  ])('maps %i deterministically', (status, expected) => {
    expect(errorCodeForStatus(status)).toBe(expected);
    expect(errorCodeForStatus(status)).toBe(expected);
  });

  it('falls back safely for unlisted statuses', () => {
    expect(errorCodeForStatus(418)).toBe(API_ERROR_CODE.BAD_REQUEST);
    expect(errorCodeForStatus(502)).toBe(API_ERROR_CODE.INTERNAL_SERVER_ERROR);
    expect(errorCodeForStatus(0)).toBe(API_ERROR_CODE.INTERNAL_SERVER_ERROR);
  });
});

describe('mapExceptionToError — known client errors', () => {
  it.each([
    [new BadRequestException('Field is required'), 400, API_ERROR_CODE.BAD_REQUEST],
    [new UnauthorizedException(), 401, API_ERROR_CODE.UNAUTHORIZED],
    [new ForbiddenException(), 403, API_ERROR_CODE.FORBIDDEN],
    [new NotFoundException(), 404, API_ERROR_CODE.NOT_FOUND],
    [new MethodNotAllowedException(), 405, API_ERROR_CODE.METHOD_NOT_ALLOWED],
    [new ConflictException(), 409, API_ERROR_CODE.CONFLICT],
    [new UnprocessableEntityException(), 422, API_ERROR_CODE.UNPROCESSABLE_ENTITY],
    [
      new HttpException('Slow down', HttpStatus.TOO_MANY_REQUESTS),
      429,
      API_ERROR_CODE.TOO_MANY_REQUESTS,
    ],
  ])('preserves the status and maps a stable code', (exception, status, code) => {
    const mapped = mapExceptionToError(exception);

    expect(mapped.status).toBe(status);
    expect(mapped.code).toBe(code);
    expect(mapped.message.length).toBeGreaterThan(0);
  });

  it('keeps a safe custom message', () => {
    expect(mapExceptionToError(new BadRequestException('Field is required')).message).toBe(
      'Field is required',
    );
  });

  it("keeps Nest's own safe default message", () => {
    // `new NotFoundException()` already carries the safe string "Not Found";
    // the mapper prefers an exception's own safe message over a substitute.
    expect(mapExceptionToError(new NotFoundException()).message).toBe('Not Found');
  });

  it.each([
    [HttpStatus.UNAUTHORIZED, 'Authentication is required.'],
    [HttpStatus.FORBIDDEN, 'You do not have permission to perform this action.'],
    [HttpStatus.NOT_FOUND, 'The requested resource was not found.'],
    [HttpStatus.CONFLICT, 'The request conflicts with the current state of the resource.'],
    [HttpStatus.TOO_MANY_REQUESTS, 'Too many requests. Please try again later.'],
  ])('supplies a neutral message for %i when the payload carries none', (status, expected) => {
    // A payload whose `message` is an unsafe nested object: nothing is copied,
    // so the neutral per-status text is used instead.
    const exception = new HttpException({ message: { nested: 'internal detail' } }, status);

    expect(mapExceptionToError(exception).message).toBe(expected);
  });

  it('converts a validation-pipe message array into structured details', () => {
    const mapped = mapExceptionToError(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'name should not be empty'],
        error: 'Bad Request',
      }),
    );

    expect(mapped.errors).toEqual([
      { field: '', code: API_ERROR_CODE.BAD_REQUEST, message: 'email must be an email' },
      { field: '', code: API_ERROR_CODE.BAD_REQUEST, message: 'name should not be empty' },
    ]);
  });

  it('passes through canonical structured field errors', () => {
    const mapped = mapExceptionToError(
      new UnprocessableEntityException({
        message: 'The request could not be processed.',
        errors: [{ field: 'status', code: 'DEPOSIT_NOT_PAID', message: 'Deposit required' }],
      }),
    );

    expect(mapped.errors).toEqual([
      { field: 'status', code: 'DEPOSIT_NOT_PAID', message: 'Deposit required' },
    ]);
  });

  it('drops malformed entries from a structured errors array', () => {
    const mapped = mapExceptionToError(
      new BadRequestException({
        errors: [
          { field: 'a', code: 'B', message: 'c' },
          { field: 'only-field' },
          'not an object',
          { field: 'd', code: 'E', message: { nested: 'object' } },
        ],
      }),
    );

    expect(mapped.errors).toEqual([{ field: 'a', code: 'B', message: 'c' }]);
  });

  it('ignores arbitrary fields on the exception payload', () => {
    const mapped = mapExceptionToError(
      new BadRequestException({
        message: 'Invalid input',
        debug: 'SELECT * FROM users WHERE token = 1',
        metadata: { connectionString: 'postgres://user:pw@db:5432/app' },
        stack: 'Error: at Object.<anonymous> (/srv/app/main.js:1:1)',
      }),
    );

    expect(mapped).toEqual({
      status: 400,
      code: API_ERROR_CODE.BAD_REQUEST,
      message: 'Invalid input',
    });
    expect(JSON.stringify(mapped)).not.toContain('postgres://');
    expect(JSON.stringify(mapped)).not.toContain('SELECT');
  });

  it('rejects a multi-line message as a probable stack trace', () => {
    const mapped = mapExceptionToError(
      new BadRequestException('Error: boom\n    at Object.<anonymous> (/srv/app/main.js:1:1)'),
    );

    expect(mapped.message).toBe('The request is invalid.');
    expect(mapped.message).not.toContain('/srv/app');
  });

  it('rejects an over-long message', () => {
    const mapped = mapExceptionToError(new BadRequestException('a'.repeat(501)));

    expect(mapped.message).toBe('The request is invalid.');
  });
});

describe('mapExceptionToError — server faults', () => {
  it('replaces the message of a server-side HttpException', () => {
    const mapped = mapExceptionToError(
      new InternalServerErrorException('Connection to postgres://u:p@db/app refused'),
    );

    expect(mapped).toEqual({
      status: 500,
      code: API_ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it.each([
    ['a plain Error carrying a secret', new Error('password=hunter2 at /srv/app/db.ts:42')],
    ['a thrown string', 'raw failure string'],
    ['a thrown object', { message: 'internal', sql: 'SELECT 1' }],
    ['a thrown null', null],
    ['a thrown number', 500],
  ])('maps %s to a generic 500', (_label, thrown) => {
    const mapped = mapExceptionToError(thrown);

    expect(mapped).toEqual({
      status: 500,
      code: API_ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it('never exposes stack or cause', () => {
    const cause = new Error('inner secret: token=abc123');
    const error = new Error('outer failure', { cause });

    const serialised = JSON.stringify(mapExceptionToError(error));

    expect(serialised).not.toContain('token=abc123');
    expect(serialised).not.toContain('outer failure');
    expect(serialised).not.toContain('at ');
  });
});
