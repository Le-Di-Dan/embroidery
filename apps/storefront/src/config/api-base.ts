/**
 * The generated API operations already encode the `/api` global prefix in their
 * paths (e.g. `GET /api/public/products`). The axios `baseURL` must therefore be
 * the ORIGIN/host WITHOUT that prefix, or every request double-prefixes to
 * `/api/api/...` and 404s. The gateway/D-036 environment values carry the full
 * API base (`/api`, `http://api:4000/api`); this strips the redundant trailing
 * `/api` so the base composes correctly with the generated operation paths.
 *
 * A browser base that reduces to empty becomes `/` (same-origin), which axios
 * composes with `/api/...` into a correct same-origin request.
 */
export function toApiOriginBase(fullApiBase: string): string {
  const trimmed = fullApiBase.trim().replace(/\/+$/, '');
  const withoutApiPrefix = trimmed.replace(/\/api$/, '');
  return withoutApiPrefix === '' ? '/' : withoutApiPrefix;
}
