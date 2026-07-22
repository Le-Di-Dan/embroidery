/**
 * Offline document-generation environment (APP0-B01).
 *
 * Building the OpenAPI document instantiates the real `AppModule`, whose
 * persistence providers require a `DATABASE_URL` at construction time — but the
 * document is generated without ever opening a connection (no `init`/`listen`,
 * so the database lifecycle hook never runs). A non-connecting placeholder lets
 * `openapi:generate` and `openapi:check` run on any machine and in CI without
 * PostgreSQL. A real `DATABASE_URL` in the environment is respected and left
 * untouched.
 */
export const GENERATION_DATABASE_URL =
  'postgres://openapi:openapi@openapi.invalid:5432/openapi_contract';

export function ensureGenerationEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env['DATABASE_URL'] === undefined || env['DATABASE_URL'] === '') {
    env['DATABASE_URL'] = GENERATION_DATABASE_URL;
  }
}
