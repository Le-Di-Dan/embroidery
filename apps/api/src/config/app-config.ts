const VALID_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type AppEnvironment = (typeof VALID_ENVIRONMENTS)[number];

export interface AppConfig {
  environment: AppEnvironment;
  port: number;
  docsEnabled: boolean;
}

const DEFAULT_PORT = 4000;
const DEFAULT_ENVIRONMENT: AppEnvironment = 'development';
const MIN_PORT = 1;
const MAX_PORT = 65_535;

/**
 * Swagger UI is a convenience in local development but must never be exposed by
 * default in production. When `API_DOCS_ENABLED` is unset the environment
 * decides; an explicit `true`/`false` always wins so an operator can turn it on
 * deliberately or force it off.
 */
const DOCS_ENABLED_BY_DEFAULT: Record<AppEnvironment, boolean> = {
  development: true,
  test: true,
  production: false,
};

function isAppEnvironment(value: string): value is AppEnvironment {
  return (VALID_ENVIRONMENTS as readonly string[]).includes(value);
}

function parseDocsEnabled(raw: string | undefined, environment: AppEnvironment): boolean {
  if (raw === undefined || raw === '') {
    return DOCS_ENABLED_BY_DEFAULT[environment];
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`Invalid API_DOCS_ENABLED "${raw}": expected "true" or "false".`);
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid API_PORT "${raw}": expected an integer between ${MIN_PORT} and ${MAX_PORT}.`,
    );
  }
  return port;
}

/**
 * Minimal startup configuration validation (BACKEND_CONVENTIONS.md §16).
 * Fails fast on invalid values instead of falling back silently.
 * A dedicated validation library is an open decision and is not used here.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const rawEnvironment = env['NODE_ENV'] ?? DEFAULT_ENVIRONMENT;
  if (!isAppEnvironment(rawEnvironment)) {
    throw new Error(
      `Invalid NODE_ENV "${rawEnvironment}": expected one of ${VALID_ENVIRONMENTS.join(', ')}.`,
    );
  }

  const rawPort = env['API_PORT'];
  const port = rawPort === undefined || rawPort === '' ? DEFAULT_PORT : parsePort(rawPort);

  const docsEnabled = parseDocsEnabled(env['API_DOCS_ENABLED'], rawEnvironment);

  return { environment: rawEnvironment, port, docsEnabled };
}
