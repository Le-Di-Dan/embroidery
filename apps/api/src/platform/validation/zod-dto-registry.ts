/**
 * The published-schema registry for schema-backed DTOs (`APP3-P03`).
 *
 * `createZodDto` returns an anonymous base class, so at the moment the schema is
 * attached nothing knows what the DTO will be *called* — and the component name
 * in the OpenAPI document is the subclass's name. A feature therefore hands its
 * finished classes to `registerZodDtos`, which reads the name off the class
 * itself. Nothing is spelled twice, so a rename cannot leave a stale string
 * pointing at a component that no longer exists.
 *
 * Registration is a publication concern only. The validation pipe reads the
 * schema straight off the metatype and never consults this registry, so a DTO
 * that is never registered still validates exactly as before — it would only
 * fail to *document* itself, and the OpenAPI augmentation refuses to emit a
 * document in which that has happened.
 */
import type { ZodType } from 'zod';

import { zodSchemaOf } from './zod-dto';

/**
 * A class produced by `createZodDto`, or a subclass of one.
 *
 * Constructible with no fixed signature: a DTO subclass is never instantiated by
 * this API — the pipe hands the handler the parsed plain object — so the shape
 * that matters is the class object itself, its name and its static schema.
 */
export type ZodDtoClass = (abstract new (...args: never[]) => unknown) & {
  readonly name: string;
};

const registrations = new Map<string, ZodType>();

/**
 * Records each DTO under its own class name for OpenAPI publication.
 *
 * Registering the same name twice with the same schema is allowed — two
 * publication commands legitimately share one body schema. Registering it twice
 * with *different* schemas is a defect: one of the two would be published under
 * a name that describes the other.
 */
export function registerZodDtos(...dtos: readonly ZodDtoClass[]): void {
  for (const dto of dtos) {
    register(dto);
  }
}

function register(dto: ZodDtoClass): void {
  const name = dto.name;
  if (name === '') {
    throw new Error(
      'A schema-backed DTO must be a named class: an anonymous one has no OpenAPI component name.',
    );
  }

  const schema = zodSchemaOf(dto);
  if (schema === undefined) {
    throw new Error(
      `\`${name}\` carries no Zod schema, so it is not a schema-backed DTO and cannot be registered.`,
    );
  }

  const existing = registrations.get(name);
  if (existing !== undefined && existing !== schema) {
    throw new Error(
      `\`${name}\` is already registered with a different schema; two DTOs cannot publish one component name.`,
    );
  }

  registrations.set(name, schema);
}

/** Every registered DTO, by the component name it publishes under. */
export function zodDtoRegistrations(): ReadonlyMap<string, ZodType> {
  return registrations;
}

/**
 * Clears the registry. Test-only: module registration is a load-time side
 * effect, and a suite that asserts on registration needs a known starting point.
 */
export function resetZodDtoRegistrations(): void {
  registrations.clear();
}
