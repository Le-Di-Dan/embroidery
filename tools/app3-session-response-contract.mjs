#!/usr/bin/env node
/**
 * The shared Design Session response contract (`APP3-P04`).
 *
 * All three public Session operations answer with the value of one function,
 * `toSessionSnapshot`, so they publish one component. Before this foundation
 * they published **no** response schema at all and the generated client typed
 * every success as `void` — a contract that told a caller nothing about the one
 * payload the Studio actually consumes.
 *
 * The rule lives here rather than in the B07 and B08 gates because both need it
 * and each carrying its own copy is how one of them keeps passing after the
 * other's operation regresses. Each gate calls this and names itself in the
 * failure.
 *
 * Read-only, cross-platform pure Node.
 */

/** The one component every Session success response wraps. */
export const SESSION_SNAPSHOT_SCHEMA = 'DesignSessionSnapshotResponse';

/** The generated `APP3-P01` component the snapshot's document must reference. */
export const DESIGN_DOCUMENT_SCHEMA = 'DesignDocument';

const SUCCESS_ENVELOPE = 'ApiSuccessResponse';

/**
 * The three operations and the success status each already returned before this
 * foundation. Publication follows runtime; none of these codes changed.
 */
export const SESSION_RESPONSE_OPERATIONS = Object.freeze([
  { path: '/api/public/design-sessions', method: 'post', status: '201' },
  { path: '/api/public/design-sessions/{sessionId}/resume', method: 'post', status: '200' },
  { path: '/api/public/design-sessions/{sessionId}/document', method: 'put', status: '200' },
]);

/** The component name a success envelope wraps as its `data`, if any. */
function wrappedComponent(schema) {
  const members = schema?.allOf ?? [];
  const envelope = members.find((member) => member?.$ref?.endsWith(SUCCESS_ENVELOPE));
  const data = members.find((member) => member?.properties?.data !== undefined);
  if (envelope === undefined || data === undefined) return undefined;
  const reference = data.properties.data.$ref;
  return typeof reference === 'string' ? reference.split('/').pop() : undefined;
}

/**
 * Asserts the response contract over a parsed OpenAPI document.
 *
 * `subset` limits which operations are checked, so the B08 gate can rule on
 * autosave alone while the B07 gate rules on the two it owns — without either
 * re-implementing what "concrete" means.
 */
export function checkSessionResponseContract(document, fail, subset) {
  const operations = subset ?? SESSION_RESPONSE_OPERATIONS.map((entry) => entry.path);

  for (const entry of SESSION_RESPONSE_OPERATIONS) {
    if (!operations.includes(entry.path)) continue;

    const operation = document.paths?.[entry.path]?.[entry.method];
    if (operation === undefined) {
      fail(`${entry.method.toUpperCase()} ${entry.path} is not published`);
      continue;
    }
    const schema = operation.responses?.[entry.status]?.content?.['application/json']?.schema;
    if (schema === undefined) {
      // The exact defect: a success with no schema generates as `void`.
      fail(`${operation.operationId}: publishes no success response schema`);
      continue;
    }
    const component = wrappedComponent(schema);
    if (component !== SESSION_SNAPSHOT_SCHEMA) {
      fail(
        `${operation.operationId}: success response wraps "${String(component)}", not ${SESSION_SNAPSHOT_SCHEMA}`,
      );
    }
  }

  const snapshot = document.components?.schemas?.[SESSION_SNAPSHOT_SCHEMA];
  if (snapshot === undefined) {
    fail(`${SESSION_SNAPSHOT_SCHEMA} is not published as a component`);
    return;
  }

  // Every field the runtime always returns is required; `scope` and `lineage`
  // are genuinely absent for some operations and must stay optional.
  for (const field of [
    'sessionId',
    'status',
    'revision',
    'expiresAt',
    'documentSchemaVersion',
    'document',
  ]) {
    if (!(snapshot.required ?? []).includes(field)) {
      fail(`${SESSION_SNAPSHOT_SCHEMA}: "${field}" is not required`);
    }
  }
  for (const field of ['scope', 'lineage']) {
    if ((snapshot.required ?? []).includes(field)) {
      fail(`${SESSION_SNAPSHOT_SCHEMA}: "${field}" is required, but runtime omits it`);
    }
  }

  // The snapshot's document is the generated P01 component, never an open map.
  const field = snapshot.properties?.document ?? {};
  const reference = field.$ref ?? field.allOf?.[0]?.$ref;
  if (reference !== `#/components/schemas/${DESIGN_DOCUMENT_SCHEMA}`) {
    fail(`${SESSION_SNAPSHOT_SCHEMA}: document does not reference ${DESIGN_DOCUMENT_SCHEMA}`);
  }
  if (field.type !== undefined || field.additionalProperties !== undefined) {
    fail(`${SESSION_SNAPSHOT_SCHEMA}: document is still published as an open object`);
  }
}

/** The generated client must type each success concretely, never as a fallback. */
export function checkGeneratedResponseTypes(client, schemas, fail, methods) {
  const NON_CONCRETE = ['void', 'any', 'unknown', 'object', 'Record<string, unknown>'];
  for (const method of methods) {
    const declaration = new RegExp(
      `export const ${method} = \\([\\s\\S]{0,600}?apiRequest<([^>]+)>`,
    );
    const match = declaration.exec(client);
    if (match === null) {
      fail(`${method} is not generated`);
      continue;
    }
    const type = match[1].trim();
    if (NON_CONCRETE.includes(type)) {
      fail(`${method} resolves its success to "${type}"`);
      continue;
    }
    if (!schemas.includes(`export type ${type} =`) && !schemas.includes(`interface ${type} `)) {
      fail(`${method} success type "${type}" is not a generated type`);
    }
  }
  if (!/document: DesignDocument/.test(schemas)) {
    fail(`${SESSION_SNAPSHOT_SCHEMA} does not carry the concrete Design Document type`);
  }
}
