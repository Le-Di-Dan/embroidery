import { readFileSync } from 'node:fs';
import path from 'node:path';

const PKG_ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(path.join(PKG_ROOT, rel), 'utf8');

const operations = read('src/generated/embroidery-api.ts');
const schemas = read('src/generated/embroidery-api.schemas.ts');
const orvalConfig = read('orval.config.ts');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe('generated operations', () => {
  it('exposes the health operations named from the OpenAPI operation ids', () => {
    expect(operations).toContain('export const healthCheck');
    expect(operations).toContain('export const healthReadiness');
  });

  it('routes every operation through the repository-owned mutator, not global axios', () => {
    expect(operations).toContain("import { apiRequest } from '../clients/api-request.mutator'");
    expect(operations).toContain('apiRequest<HealthStatusResponse>');
    expect(operations).not.toMatch(/import\s+axios/);
    expect(operations).not.toMatch(/\baxios\.(get|post|put|patch|delete|request)\b/);
  });

  it('carries the generated "do not edit" header and no hand-edit escape hatch', () => {
    expect(operations).toContain('Do not edit manually');
    expect(operations).not.toContain('@ts-nocheck');
    expect(operations).not.toContain('eslint-disable');
    expect(schemas).not.toContain('@ts-nocheck');
  });
});

describe('generated schemas', () => {
  it('includes the envelope and request-id correlation types', () => {
    expect(schemas).toContain('export interface ApiResponseMeta');
    expect(schemas).toContain('requestId');
    expect(schemas).toContain('export interface ApiErrorResponse');
    expect(schemas).toContain('export interface HealthStatusResponse');
    expect(schemas).toContain('export interface ReadinessStatusResponse');
  });
});

describe('generated tree hygiene', () => {
  const both = `${operations}\n${schemas}`;

  it('embeds no machine-specific values', () => {
    expect(both).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(both).not.toMatch(/[A-Za-z]:\\Users\\/);
    expect(both).not.toMatch(/\/Users\//);
    expect(both).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // ISO timestamp
  });

  it('generates no query hooks or alternative HTTP runtime', () => {
    expect(both).not.toMatch(/tanstack|react-query|useQuery|useMutation|swr/i);
    expect(both).not.toMatch(/\bfetch\(/);
  });
});

describe('generation config (IMP-D023)', () => {
  it('pins orval exactly and keeps it a devDependency with axios as the runtime dep', () => {
    expect(packageJson.devDependencies.orval).toBe('8.22.0');
    expect(packageJson.dependencies.orval).toBeUndefined();
    expect(packageJson.dependencies.axios).toBeDefined();
  });

  it('exposes the generate and drift-check scripts', () => {
    expect(packageJson.scripts.generate).toContain('generate-client.mjs');
    expect(packageJson.scripts['check:generated']).toContain('check-generated-client.mjs');
  });

  it('drives axios-functions from the committed artifact through the apiRequest mutator', () => {
    expect(orvalConfig).toContain('../contracts/openapi/openapi.generated.json');
    expect(orvalConfig).toContain("client: 'axios-functions'");
    expect(orvalConfig).toContain("name: 'apiRequest'");
    // No query-hook client mode is configured (comments may mention them).
    expect(orvalConfig).not.toMatch(/client:\s*['"](?:react-query|vue-query|svelte-query|swr)/i);
    expect(orvalConfig).not.toMatch(/target:\s*['"]https?:\/\//); // no live Swagger URL input
  });
});
