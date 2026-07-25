import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Registers the canonical Zod validation pipe globally (APP1-B01-C1).
 *
 * `APP_PIPE` rather than `app.useGlobalPipes()` in `main.ts`, so every
 * application-creation path — the runtime bootstrap, the OpenAPI generator, and
 * the T01 integration harness, which all build the same `AppModule` — gets the
 * identical validation behaviour from one place. The pipe leaves non-Zod
 * parameters untouched, so it is safe to apply globally.
 */
@Module({
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class ValidationModule {}
