#!/usr/bin/env node
/**
 * `APP3-B07` — the published-contract half, runnable alone.
 *
 * Everything here reads the generated artifact and the request schema: the two
 * operations, the discriminated union, the concrete path parameter, and the
 * absence of any secret material. Split from the parent on responsibility —
 * these are the checks a reviewer runs when the question is "what did we
 * publish", and the parent asks "does the implementation still mean it".
 *
 * Read-only, cross-platform pure Node.
 */
import { acceptedSurface } from './app3-accepted-surface.mjs';
import { CANONICAL_FILES, code, read, requireAll } from './check-app3-b07-files.mjs';

/** 2, 3 — exactly two operations on the published surface. */
export function checkSurface(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  // Derived, never pinned: `APP3-B06B` legitimately adds a third Session route,
  // and a gate that carried its own copy of history would have to be edited by
  // every checkpoint that ships an operation.
  const {
    paths: PATHS,
    operations: OPERATIONS,
    schemas: SCHEMAS,
    designSessionPaths,
  } = acceptedSurface(rootDir);
  const document = JSON.parse(raw);
  const paths = Object.keys(document.paths);
  const operations = Object.values(document.paths).reduce(
    (total, item) =>
      total +
      Object.keys(item).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).length,
    0,
  );
  const schemas = Object.keys(document.components.schemas).length;
  if (paths.length !== PATHS)
    fail(`${CANONICAL_FILES.openapi}: ${paths.length} paths, expected ${PATHS}`);
  if (operations !== OPERATIONS)
    fail(`${CANONICAL_FILES.openapi}: ${operations} operations, expected ${OPERATIONS}`);
  if (SCHEMAS !== undefined && schemas !== SCHEMAS)
    fail(`${CANONICAL_FILES.openapi}: ${schemas} schemas, expected ${SCHEMAS}`);

  const sessionPaths = paths.filter((path) => path.includes('design-session'));
  if (sessionPaths.length !== designSessionPaths) {
    fail(
      `${CANONICAL_FILES.openapi}: ${sessionPaths.length} design-session paths, ` +
        `expected ${designSessionPaths}`,
    );
  }
  const ids = sessionPaths.flatMap((path) =>
    Object.values(document.paths[path]).map((operation) => operation.operationId),
  );
  for (const id of ['publicDesignSession_create', 'publicDesignSession_resume']) {
    if (!ids.includes(id)) fail(`${CANONICAL_FILES.openapi}: missing operation ${id}`);
  }

  // The union must publish as a union, not as an empty object.
  const body = document.components.schemas['CreateDesignSessionBody'];
  if (body === undefined || !Array.isArray(body.oneOf) || body.oneOf.length !== 2) {
    fail(`${CANONICAL_FILES.openapi}: the bootstrap body does not publish both branches`);
  }
  for (const branch of ['CreateBlankDesignSessionBody', 'CloneDesignSessionBody']) {
    const schema = document.components.schemas[branch];
    if (schema === undefined || Object.keys(schema.properties ?? {}).length === 0) {
      fail(`${CANONICAL_FILES.openapi}: ${branch} publishes no properties`);
    }
  }
  // No B07 parameter may publish an empty schema.
  for (const path of sessionPaths) {
    for (const operation of Object.values(document.paths[path])) {
      for (const parameter of operation.parameters ?? []) {
        if (Object.keys(parameter.schema ?? {}).length === 0) {
          fail(`${CANONICAL_FILES.openapi}: ${path} parameter "${parameter.name}" publishes {}`);
        }
      }
    }
  }
  if (/secretPepper|sessionSecretHash|rawSecret/.test(raw)) {
    fail(`${CANONICAL_FILES.openapi}: publishes secret material`);
  }
}

/** 4, 5 — the request contract is one strict discriminated union. */
export function checkRequestContract(rootDir, fail) {
  requireAll(
    rootDir,
    'request',
    [
      [/discriminatedUnion\('mode'/, 'the body is not a discriminated union'],
      [/z\.literal\('BLANK'\)/, 'the BLANK branch is gone'],
      [/z\.literal\('CLONE_TEMPLATE'\)/, 'the CLONE_TEMPLATE branch is gone'],
      [/templateSlug/, 'the clone branch carries no Template identifier'],
      [/\.strict\(\)/, 'unknown fields are no longer rejected'],
      [/createZodDto\(createDesignSessionSchema\)/, 'the DTO is not built from the one schema'],
    ],
    fail,
  );
  const request = code(read(rootDir, 'request') ?? '');
  for (const owned of [
    'sessionId:',
    'secret',
    'status:',
    'expiresAt',
    'revision',
    'designDocument',
  ]) {
    if (new RegExp(`${owned}[^)]*z\\.`).test(request.split('scopeShape')[1] ?? '')) {
      fail(`${CANONICAL_FILES.request}: accepts the server-owned field ${owned}`);
    }
  }
  // The controller narrows with the same schema, never a cast.
  requireAll(
    rootDir,
    'controller',
    [
      [
        /createDesignSessionSchema\.parse\(body\)/,
        'the controller does not narrow with the schema',
      ],
      [/input\.mode === 'CLONE_TEMPLATE'/, 'clone fields are not read inside the branch'],
    ],
    fail,
  );
  // Any widening cast at all, not just one spelled `body as unknown`: the
  // controller is the only place request data is still untyped, so a cast of
  // *any* binding here is a cast of the request body under another name.
  if (/\bas\s+(unknown|any)\b/.test(code(read(rootDir, 'controller') ?? ''))) {
    fail(`${CANONICAL_FILES.controller}: casts the request body`);
  }
}
