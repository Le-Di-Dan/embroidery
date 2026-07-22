import { type OpenAPIObject } from '@nestjs/swagger';

import { serializeOpenApiDocument } from './serialize-openapi-document';

function documentWith(overrides: Partial<OpenAPIObject> = {}): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 'test', version: '0.0.0' },
    paths: {},
    ...overrides,
  };
}

describe('serializeOpenApiDocument', () => {
  it('sorts object keys so insertion order cannot change the bytes', () => {
    const ordered = serializeOpenApiDocument(documentWith({ paths: { '/b': {}, '/a': {} } }));
    const reversed = serializeOpenApiDocument(documentWith({ paths: { '/a': {}, '/b': {} } }));
    expect(ordered).toBe(reversed);
    expect(ordered.indexOf('"/a"')).toBeLessThan(ordered.indexOf('"/b"'));
  });

  it('preserves array order, which is semantically significant', () => {
    const serialized = serializeOpenApiDocument(
      documentWith({
        paths: {
          '/a': { get: { parameters: ['second', 'first'] } },
        } as unknown as OpenAPIObject['paths'],
      }),
    );
    expect(serialized.indexOf('"second"')).toBeLessThan(serialized.indexOf('"first"'));
  });

  it('emits LF-only output with a trailing newline', () => {
    const serialized = serializeOpenApiDocument(documentWith());
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized).not.toContain('\r');
  });

  it('is byte-identical across repeated serializations', () => {
    const document = documentWith({ paths: { '/a': {} } });
    expect(serializeOpenApiDocument(document)).toBe(serializeOpenApiDocument(document));
  });
});
