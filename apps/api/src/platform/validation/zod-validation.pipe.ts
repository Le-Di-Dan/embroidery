/**
 * Global Zod validation pipe (APP1-B01-C1).
 *
 * The single, reusable validation entry point for the API. A parameter whose
 * metatype carries a Zod schema (via `createZodDto`) is parsed and its typed
 * output returned; any other parameter — a primitive, a plain object, a health
 * DTO — passes through untouched, so existing endpoints are unaffected.
 *
 * A validation failure becomes the canonical `400 BAD_REQUEST` envelope with
 * field-level `errors[]` (FU-A03); the platform exception filter renders it. No
 * raw Zod object, received value, or schema internal is ever exposed, and an
 * unexpected internal parsing fault is reported generically rather than leaking.
 */
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

import { mapZodError } from './zod-issue.mapper';
import { zodSchemaOf } from './zod-dto';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = zodSchemaOf(metadata.metatype);
    if (schema === undefined) {
      // Not a Zod-backed parameter — leave it exactly as received.
      return value;
    }
    return this.parse(schema, value);
  }

  private parse(schema: ZodType, value: unknown): unknown {
    let result: ReturnType<ZodType['safeParse']>;
    try {
      result = schema.safeParse(value);
    } catch {
      // `safeParse` returns issues rather than throwing for invalid input; a
      // throw here means a broken schema or runtime fault — report it safely.
      throw new InternalServerErrorException();
    }

    if (result.success) {
      return result.data;
    }

    // A parse failure is a client error: map its issues to the canonical
    // field-error contract. `mapZodError` is the only reader of raw issues, so a
    // raw issue can never reach the client.
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'The request is invalid.',
      errors: mapZodError(result.error),
    });
  }
}
