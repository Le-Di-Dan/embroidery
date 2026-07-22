import { type OpenAPIObject } from '@nestjs/swagger';

/**
 * Canonical operation-ID policy (APP0-B01).
 *
 * Operation IDs are a public contract the generated client depends on, so they
 * must be deterministic, unique, and independent of route-registration order.
 * The policy is `<domainKey>_<methodKey>`, derived from the controller class
 * name (minus the `Controller` suffix) and the handler method name — both
 * stable source identifiers, never a hash, timestamp, or environment value.
 */
export const OPERATION_ID_PATTERN = /^[a-z][a-zA-Z0-9]*_[a-zA-Z][a-zA-Z0-9]*$/;

const CONTROLLER_SUFFIX = /Controller$/;

/** HTTP method keys a Path Item Object may carry; other keys are not operations. */
const HTTP_METHOD_KEYS: ReadonlySet<string> = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * Deterministic operation-ID factory passed to `SwaggerModule.createDocument`.
 * `HealthController#check` becomes `health_check`.
 */
export function createOperationId(controllerKey: string, methodKey: string): string {
  const domain = controllerKey.replace(CONTROLLER_SUFFIX, '');
  if (domain === '' || methodKey === '') {
    throw new Error(
      `Cannot derive an operation id from controller "${controllerKey}" and method "${methodKey}".`,
    );
  }
  const domainKey = domain.charAt(0).toLowerCase() + domain.slice(1);
  return `${domainKey}_${methodKey}`;
}

/**
 * Fails when any documented operation has a missing, malformed, or duplicated
 * operation ID. The message names the offending operation(s) so the failure is
 * actionable rather than a bare boolean.
 */
export function validateOperationIds(document: OpenAPIObject): void {
  const locationsById = new Map<string, string>();

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHOD_KEYS.has(method)) {
        continue;
      }
      const location = `${method.toUpperCase()} ${path}`;
      const operationId = (operation as { operationId?: unknown }).operationId;

      if (typeof operationId !== 'string' || operationId === '') {
        throw new Error(`Operation ${location} is missing an operationId.`);
      }
      if (!OPERATION_ID_PATTERN.test(operationId)) {
        throw new Error(
          `Operation ${location} has an invalid operationId "${operationId}"; ` +
            `expected the <domain>_<method> pattern ${OPERATION_ID_PATTERN.source}.`,
        );
      }
      const existing = locationsById.get(operationId);
      if (existing !== undefined) {
        throw new Error(`Duplicate operationId "${operationId}" on ${existing} and ${location}.`);
      }
      locationsById.set(operationId, location);
    }
  }
}
