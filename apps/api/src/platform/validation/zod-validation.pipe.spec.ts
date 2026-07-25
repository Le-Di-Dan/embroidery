import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';
import { createZodDto } from './zod-dto';

interface ErrorPayload {
  code?: string;
  errors: Array<{ field: string; code: string; message?: string }>;
}

/** Reads the mapped payload from a thrown BadRequestException, via `unknown`. */
function payloadOf(error: unknown): ErrorPayload {
  const raw: unknown = (error as BadRequestException).getResponse();
  return raw as ErrorPayload;
}

const Schema = z
  .object({
    name: z.string().refine((v) => v.length > 0, { params: { fieldCode: 'REQUIRED' } }),
    nested: z.object({ age: z.number() }),
  })
  .strict();

class SampleDto extends createZodDto(Schema) {}

function meta(metatype: unknown): ArgumentMetadata {
  return { type: 'body', metatype: metatype as ArgumentMetadata['metatype'], data: undefined };
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('passes a non-Zod parameter through untouched', () => {
    expect(pipe.transform('anything', meta(String))).toBe('anything');
    expect(pipe.transform({ a: 1 }, meta(Object))).toEqual({ a: 1 });
    expect(pipe.transform(42, meta(undefined))).toBe(42);
  });

  it('returns the parsed, typed output for a valid Zod body', () => {
    const result = pipe.transform({ name: 'ok', nested: { age: 3 } }, meta(SampleDto));
    expect(result).toEqual({ name: 'ok', nested: { age: 3 } });
  });

  it('throws a canonical 400 with field errors for an invalid body', () => {
    try {
      pipe.transform({ name: '', nested: { age: 'x' } }, meta(SampleDto));
      throw new Error('expected throw');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      const payload = payloadOf(error);
      expect(payload.code).toBe('BAD_REQUEST');
      expect(payload.errors.some((e) => e.field === 'name' && e.code === 'REQUIRED')).toBe(true);
      expect(
        payload.errors.every((e) => typeof e.message === 'string' && e.message.length > 0),
      ).toBe(true);
      // Nested path joined by '.'.
      expect(payload.errors.map((e) => e.field)).toContain('nested.age');
      // Deterministic order (sorted by field).
      expect(payload.errors.map((e) => e.field)).toEqual(
        [...payload.errors.map((e) => e.field)].sort(),
      );
    }
  });

  it('rejects an unknown field with UNKNOWN_FIELD', () => {
    try {
      pipe.transform({ name: 'x', nested: { age: 1 }, extra: true }, meta(SampleDto));
      throw new Error('expected throw');
    } catch (error: unknown) {
      const payload = payloadOf(error);
      expect(payload.errors.some((e) => e.field === 'extra' && e.code === 'UNKNOWN_FIELD')).toBe(
        true,
      );
    }
  });

  it('never leaks the received value into the error payload', () => {
    try {
      pipe.transform({ name: 'sensitive-secret-value', nested: { age: 'x' } }, meta(SampleDto));
      throw new Error('expected throw');
    } catch (error: unknown) {
      const serialized = JSON.stringify(payloadOf(error));
      expect(serialized).not.toContain('sensitive-secret-value');
    }
  });
});
