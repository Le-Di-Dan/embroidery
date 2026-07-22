/**
 * Gateway/API request-ID drift guard (APP0-B02).
 *
 * The gateway and the API each validate the incoming `X-Request-ID` against an
 * allowlist. If those two allowlists ever diverge, correlation breaks silently:
 * the gateway would log one id while the API used another, and no test would
 * fail. This asserts the specific invariants that must hold together, reading
 * the canonical Nginx templates rather than parsing the configuration language.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findRepositoryRoot } from '../../openapi/openapi-artifact';
import { REQUEST_ID_HEADER, REQUEST_ID_PATTERN_SOURCE } from './request-id.contract';

const GATEWAY_ROUTING_TEMPLATE = 'infrastructure/nginx/templates/development.conf.template';
const GATEWAY_PROXY_HEADERS_TEMPLATE =
  'infrastructure/nginx/templates/includes/proxy-headers.conf.template';

function readGatewayFile(relativePath: string): string {
  const root = findRepositoryRoot(__dirname);
  return readFileSync(join(root, ...relativePath.split('/')), 'utf8');
}

describe('gateway and API request-ID contract', () => {
  let routing: string;
  let proxyHeaders: string;

  beforeAll(() => {
    routing = readGatewayFile(GATEWAY_ROUTING_TEMPLATE);
    proxyHeaders = readGatewayFile(GATEWAY_PROXY_HEADERS_TEMPLATE);
  });

  it('sends the effective ID upstream under the header name the API reads', () => {
    expect(proxyHeaders).toContain(`proxy_set_header ${REQUEST_ID_HEADER} $effective_request_id;`);
  });

  it('uses the identical allowlist the API validates against', () => {
    // The API constant is embedded verbatim in the Nginx map; a change to either
    // side without the other fails here with an actionable diff.
    expect(routing).toContain(`'~${REQUEST_ID_PATTERN_SOURCE}'    $http_x_request_id;`);
  });

  it('derives the effective ID from the incoming header with a native fallback', () => {
    expect(routing).toContain('map $http_x_request_id $effective_request_id {');
    expect(routing).toContain('default                      $request_id;');
  });

  it('keeps the gateway as the sole response-header owner', () => {
    // Documented ownership: the API must not also set this header.
    expect(routing).toContain(`add_header ${REQUEST_ID_HEADER} $effective_request_id always;`);
  });

  it('declares no second correlation header name anywhere in the gateway', () => {
    for (const source of [routing, proxyHeaders]) {
      expect(source).not.toMatch(/X-Correlation-ID/i);
      expect(source).not.toMatch(/X-Trace-ID/i);
    }
  });

  it('states the same maximum length on both sides', () => {
    const gatewayLength = /\{1,(\d+)\}/.exec(REQUEST_ID_PATTERN_SOURCE)?.[1];
    expect(gatewayLength).toBe('64');
    expect(routing).toContain('{1,64}');
  });
});
