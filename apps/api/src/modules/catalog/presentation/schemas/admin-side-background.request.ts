/**
 * Path validation for the Admin Side-background route (`APP3-B02A`).
 *
 * Both segments are UUIDs, which is the whole shape this route accepts. Admin
 * already holds both ids from the placement model, so there is no reason to
 * admit a slug or a code here — and an id-addressed route cannot be reached by
 * guessing a public address.
 *
 * `.strict()` as everywhere else. Neither value ever becomes part of an
 * object-storage key: the key is read from `asset_derivatives.storage_key`, so
 * no amount of path manipulation can reach an arbitrary object.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

export const adminSideBackgroundParamsSchema = z
  .object({
    productId: z.string().uuid(),
    sideId: z.string().uuid(),
  })
  .strict();

export class AdminSideBackgroundParams extends createZodDto(adminSideBackgroundParamsSchema) {}

registerZodDtos(AdminSideBackgroundParams);
