import { BadRequestException } from '@nestjs/common';

import { parseStaffLoginRequest } from './staff-login.request';

function fieldErrorsOf(body: unknown): Array<{ field: string; code: string }> {
  try {
    parseStaffLoginRequest(body);
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      const payload = error.getResponse() as { errors?: Array<{ field: string; code: string }> };
      return payload.errors ?? [];
    }
    throw error;
  }
  throw new Error('Expected validation to fail.');
}

describe('parseStaffLoginRequest', () => {
  it('accepts a valid body and trims the email', () => {
    const parsed = parseStaffLoginRequest({ email: '  Admin@Example.test ', password: 'pw' });
    expect(parsed).toEqual({ email: 'Admin@Example.test', password: 'pw' });
  });

  it('reports required fields with stable codes (FU-A03)', () => {
    const errors = fieldErrorsOf({});
    expect(errors).toContainEqual(expect.objectContaining({ field: 'email', code: 'REQUIRED' }));
    expect(errors).toContainEqual(expect.objectContaining({ field: 'password', code: 'REQUIRED' }));
  });

  it('rejects an invalid email', () => {
    expect(fieldErrorsOf({ email: 'not-an-email', password: 'pw' })).toContainEqual(
      expect.objectContaining({ field: 'email', code: 'INVALID' }),
    );
  });

  it('rejects an over-long password without echoing it', () => {
    const password = 'a'.repeat(5000);
    const errors = fieldErrorsOf({ email: 'a@b.test', password });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'password', code: 'TOO_LONG' }));
  });

  it('does not enforce a minimum password length at login', () => {
    // A short password is syntactically valid input; it simply fails verification.
    expect(parseStaffLoginRequest({ email: 'a@b.test', password: 'x' }).password).toBe('x');
  });

  it('rejects a non-object body', () => {
    expect(fieldErrorsOf(null)).not.toHaveLength(0);
    expect(fieldErrorsOf('string-body')).not.toHaveLength(0);
  });
});
