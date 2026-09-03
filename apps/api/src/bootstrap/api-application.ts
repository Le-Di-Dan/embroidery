import { type NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

/**
 * Browser-visible API paths are /api/* behind the development gateway; the
 * gateway forwards them unchanged, so the API owns the same prefix (D-036).
 * Health lives under the prefix as GET /api/health. This constant is shared by
 * the runtime bootstrap and the OpenAPI generator so the documented paths match
 * the routes the process actually serves.
 */
export const GLOBAL_ROUTE_PREFIX = 'api';

/**
 * Trust exactly one proxy hop: in normal mode the API is reachable only
 * through the internal Nginx gateway, which sets X-Forwarded-* headers.
 * Assumption (documented in LOCAL_DEVELOPMENT.md): clients never reach the
 * API directly except via the loopback-only debug overlay, so a wider
 * trust setting is unnecessary and would be spoofable. This is a
 * development-topology value only — production trust-proxy configuration
 * must be re-decided with the Gateway API/controller topology.
 */
const TRUSTED_PROXY_HOPS = 1;

/**
 * Creates the API application and applies the invariants that also shape the
 * OpenAPI contract (global prefix). It deliberately does not listen, enable
 * shutdown hooks, or configure Swagger UI: the runtime entry point
 * (`main.ts`) owns those, while the OpenAPI generator reuses this same module
 * and configuration without binding a port.
 */
export async function createApiApplication(
  options?: NestApplicationOptions,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, options);
  app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  // Express answers every request with `X-Powered-By: Express` unless this is
  // disabled (`APP12-H01` §12). It names the framework — and so the advisory
  // feed to read — to any caller who sends one request, and no client, gateway
  // or test reads it. Set here rather than at the gateway so the API is not
  // announcing itself on a topology where something forwards it unchanged, and
  // so the OpenAPI generator, which reuses this factory, behaves identically.
  app.set('x-powered-by', false);
  return app;
}
