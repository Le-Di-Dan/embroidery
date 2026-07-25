import { DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';

/**
 * Canonical OpenAPI document metadata (APP0-B01).
 *
 * The values are static and environment-independent on purpose: the generated
 * artifact is a cross-application contract and must be byte-identical on every
 * machine. No server URL is declared — the contract is same-origin and adding a
 * host would leak an environment-specific value into a committed file.
 */
export const OPENAPI_DOCUMENT_TITLE = 'Embroidery Commerce API';

export const OPENAPI_DOCUMENT_DESCRIPTION =
  'Internal HTTP contract for the Embroidery Commerce platform API. Generated from ' +
  'NestJS Swagger metadata; the committed artifact is the machine-readable source ' +
  'for the generated TypeScript/Axios client.';

/**
 * Semantic contract version, aligned with the `@embroidery/api` package version.
 * Bump it deliberately when the published contract changes; it is never derived
 * from an environment value.
 */
export const OPENAPI_DOCUMENT_VERSION = '0.1.0';

/**
 * Security scheme name for the admin session cookie (APP1-B01). The development
 * cookie name is documented; the token itself is never part of any schema.
 */
export const STAFF_SESSION_COOKIE_SCHEME = 'adminSession';

/** Builds the static document configuration (everything except the scanned paths). */
export function buildOpenApiConfig(): Omit<OpenAPIObject, 'paths'> {
  return (
    new DocumentBuilder()
      .setTitle(OPENAPI_DOCUMENT_TITLE)
      .setDescription(OPENAPI_DOCUMENT_DESCRIPTION)
      .setVersion(OPENAPI_DOCUMENT_VERSION)
      // Cookie auth for protected staff routes. `@ApiCookieAuth()` references this
      // by name; the cookie is HttpOnly and its value is never a response body.
      .addCookieAuth(
        'adm_session',
        { type: 'apiKey', in: 'cookie', name: 'adm_session' },
        STAFF_SESSION_COOKIE_SCHEME,
      )
      .build()
  );
}
