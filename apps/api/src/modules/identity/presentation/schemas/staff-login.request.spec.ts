import 'reflect-metadata';

import { mapZodError } from '../../../../platform/validation/zod-issue.mapper';
import { zodSchemaOf } from '../../../../platform/validation/zod-dto';
import { StaffLoginRequest, StaffLoginRequestDto, StaffLoginSchema } from './staff-login.request';

/** Reads the property names Swagger will document for a decorated DTO class. */
function swaggerProps(dto: object): string[] {
  const keys = Reflect.getMetadata('swagger/apiModelPropertiesArray', dto) as string[] | undefined;
  // The metadata stores names as ":email"; strip the leading marker.
  return (keys ?? []).map((k) => k.replace(/^:/, '')).sort();
}

/** Parses through the schema and maps any error to the canonical field errors. */
function fieldErrorsOf(body: unknown): Array<{ field: string; code: string }> {
  const result = StaffLoginSchema.safeParse(body);
  if (result.success) {
    throw new Error('Expected validation to fail.');
  }
  return mapZodError(result.error).map(({ field, code }) => ({ field, code }));
}

describe('StaffLoginSchema', () => {
  it('normalizes the email and preserves the raw password', () => {
    const result = StaffLoginSchema.safeParse({
      email: '  Admin@Example.TEST ',
      password: '  Passw0rd-With-Spaces  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('admin@example.test');
      expect(result.data.password).toBe('  Passw0rd-With-Spaces  ');
    }
  });

  it('treats NFKC-equivalent emails as equal', () => {
    // U+FF41 fullwidth 'a' normalizes to 'a'.
    const result = StaffLoginSchema.safeParse({ email: 'ａdmin@example.test', password: 'x' });
    expect(result.success && result.data.email).toBe('admin@example.test');
  });

  it('reports REQUIRED for missing fields', () => {
    const errors = fieldErrorsOf({});
    expect(errors).toContainEqual({ field: 'email', code: 'REQUIRED' });
    expect(errors).toContainEqual({ field: 'password', code: 'REQUIRED' });
  });

  it('reports INVALID for a malformed email', () => {
    expect(fieldErrorsOf({ email: 'not-an-email', password: 'x' })).toContainEqual({
      field: 'email',
      code: 'INVALID',
    });
  });

  it('reports TOO_LONG for an over-byte email and password', () => {
    expect(fieldErrorsOf({ email: `${'a'.repeat(250)}@ex.test`, password: 'x' })).toContainEqual({
      field: 'email',
      code: 'TOO_LONG',
    });
    expect(fieldErrorsOf({ email: 'a@b.test', password: 'a'.repeat(5000) })).toContainEqual({
      field: 'password',
      code: 'TOO_LONG',
    });
  });

  it('rejects unknown fields (strict)', () => {
    expect(fieldErrorsOf({ email: 'a@b.test', password: 'x', role: 'admin' })).toContainEqual({
      field: 'role',
      code: 'UNKNOWN_FIELD',
    });
  });

  it('rejects a non-object body', () => {
    expect(fieldErrorsOf(null)).not.toHaveLength(0);
    expect(fieldErrorsOf([])).not.toHaveLength(0);
  });

  it('produces a deterministic, sorted error array for multiple issues', () => {
    const errors = mapZodError(StaffLoginSchema.safeParse({}).error!);
    // Sorted by field: email before password.
    expect(errors.map((e) => e.field)).toEqual(['email', 'password']);
  });

  it('does not enforce a minimum login password length', () => {
    expect(StaffLoginSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
  });
});

describe('StaffLoginRequestDto', () => {
  it('carries the schema as pipe-detectable metadata', () => {
    expect(zodSchemaOf(StaffLoginRequestDto)).toBe(StaffLoginSchema);
  });
});

describe('Swagger DTO / schema contract', () => {
  it('documents exactly the Zod schema fields (drift guard)', () => {
    const schemaKeys = Object.keys(StaffLoginSchema.shape).sort();
    expect(schemaKeys).toEqual(['email', 'password']);
    // The Swagger DTO must document the same field set the schema validates, so
    // the OpenAPI body and the runtime validation never drift apart.
    expect(swaggerProps(StaffLoginRequest.prototype)).toEqual(schemaKeys);
  });
});
