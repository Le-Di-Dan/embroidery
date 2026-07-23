import { defineConfig } from 'orval';

/**
 * Orval generation contract for the internal API client (APP0-C02, IMP-D023).
 *
 * - Input is the committed offline OpenAPI artifact — never a live Swagger URL.
 * - `axios-functions` mode with the repository-owned `apiRequest` mutator, so
 *   generated code holds no Axios instance, base URL or secret of its own.
 * - No React Query / TanStack / SWR / Zod / mock generation.
 *
 * Output target and mutator path default to the tracked package locations and
 * may be redirected to a temp directory (via env) by the non-mutating drift
 * checker; both are resolved by the generation scripts so the generated
 * mutator import stays byte-identical across locations.
 */
const outputTarget = process.env.ORVAL_OUTPUT_TARGET ?? './src/generated/embroidery-api.ts';
const mutatorPath = process.env.ORVAL_MUTATOR_PATH ?? './src/clients/api-request.mutator.ts';

export default defineConfig({
  embroidery: {
    input: {
      target: '../contracts/openapi/openapi.generated.json',
    },
    output: {
      mode: 'split',
      target: outputTarget,
      client: 'axios-functions',
      clean: true,
      override: {
        mutator: {
          path: mutatorPath,
          name: 'apiRequest',
        },
      },
    },
  },
});
