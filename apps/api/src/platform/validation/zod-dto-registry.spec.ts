/**
 * The publication registry (`APP3-P03` §9).
 *
 * The registry decides what name a body is published under, so its failure
 * modes are contract failures: an anonymous class has no component name, a
 * non-DTO has no schema, and one name standing for two different schemas would
 * publish one body's shape under the other body's name.
 */
import { z } from 'zod';

import { createZodDto } from './zod-dto';
import { registerZodDtos, resetZodDtoRegistrations, zodDtoRegistrations } from './zod-dto-registry';

const schema = z.object({ a: z.string() }).strict();
const other = z.object({ b: z.string() }).strict();

beforeEach(() => {
  resetZodDtoRegistrations();
});

afterAll(() => {
  resetZodDtoRegistrations();
});

describe('registerZodDtos', () => {
  it('records a DTO under its own class name', () => {
    class SampleBody extends createZodDto(schema) {}
    registerZodDtos(SampleBody);
    expect(zodDtoRegistrations().get('SampleBody')).toBe(schema);
  });

  it('records several DTOs in one call', () => {
    class FirstBody extends createZodDto(schema) {}
    class SecondBody extends createZodDto(other) {}
    registerZodDtos(FirstBody, SecondBody);
    expect([...zodDtoRegistrations().keys()].sort()).toEqual(['FirstBody', 'SecondBody']);
  });

  it('accepts two DTOs that deliberately share one schema', () => {
    class PublishBody extends createZodDto(schema) {}
    class UnpublishBody extends createZodDto(schema) {}
    expect(() => registerZodDtos(PublishBody, UnpublishBody)).not.toThrow();
    expect(zodDtoRegistrations().get('UnpublishBody')).toBe(schema);
  });

  it('registering the same DTO twice is idempotent', () => {
    class SampleBody extends createZodDto(schema) {}
    registerZodDtos(SampleBody);
    registerZodDtos(SampleBody);
    expect(zodDtoRegistrations().size).toBe(1);
  });

  it('refuses two different schemas under one name', () => {
    class SampleBody extends createZodDto(schema) {}
    class Duplicate extends createZodDto(other) {}
    Object.defineProperty(Duplicate, 'name', { value: 'SampleBody' });
    registerZodDtos(SampleBody);
    expect(() => registerZodDtos(Duplicate)).toThrow(/cannot publish one component name/);
  });

  it('refuses an anonymous class, which has no component name to publish under', () => {
    const anonymous = createZodDto(schema);
    Object.defineProperty(anonymous, 'name', { value: '' });
    expect(() => registerZodDtos(anonymous)).toThrow(/must be a named class/);
  });

  it('refuses a class that carries no Zod schema', () => {
    class NotADto {}
    expect(() => registerZodDtos(NotADto)).toThrow(/carries no Zod schema/);
  });

  it('reads the schema off a subclass, which is what a feature actually declares', () => {
    class BaseBody extends createZodDto(schema) {}
    class DerivedBody extends BaseBody {}
    registerZodDtos(DerivedBody);
    expect(zodDtoRegistrations().get('DerivedBody')).toBe(schema);
  });

  it('is a publication concern only: an unregistered DTO still carries its schema', () => {
    class UnregisteredBody extends createZodDto(schema) {}
    expect(zodDtoRegistrations().has('UnregisteredBody')).toBe(false);
    expect(UnregisteredBody.zodSchema).toBe(schema);
  });
});
