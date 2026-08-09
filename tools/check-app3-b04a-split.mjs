#!/usr/bin/env node
/**
 * The responsibility split `APP3-B04A` performed, as rules.
 *
 * Closing `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01` meant cutting one controller
 * into two and one adapter into three. That is a refactor, and a refactor that
 * changes a **published identifier** is not a refactor at all — which is exactly
 * what happened here before it was caught: the operation-id policy derives the
 * domain key from the controller class name, so splitting the class silently
 * reissued eight *accepted* operation ids and broke every generated client for a
 * change that altered no behaviour.
 *
 * So these rules live together and apart from the restore transition itself:
 * they are about the split, not about `TR-LC24-06`. Consumed by
 * `check-app3-b04a.mjs`, which stays under its own size budget by delegating.
 *
 * Read-only, cross-platform pure Node.
 */
import { adminTemplateSurfaceFiles } from './app3-accepted-surface.mjs';

/** The one file-size limit CLAUDE.md §6 sets for logic sources. */
export const RUNTIME_FILE_LIMIT = 400;

/** The controller classes that must declare one shared publication domain. */
export const SPLIT_CONTROLLERS = Object.freeze([
  'AdminDesignTemplateAuthoringController',
  'AdminDesignTemplateLifecycleController',
]);

/**
 * Every Admin Design Template operation id accepted before this checkpoint.
 *
 * Transcribed rather than derived from the artifact: a count read out of the
 * document it is meant to constrain would accept whatever the document said, and
 * the failure being guarded against is precisely a *renamed* id, which keeps
 * every count identical.
 */
export const ACCEPTED_TEMPLATE_OPERATION_IDS = Object.freeze([
  'adminDesignTemplate_list',
  'adminDesignTemplate_create',
  'adminDesignTemplate_detail',
  'adminDesignTemplate_saveDocument',
  'adminDesignTemplate_assignScope',
  'adminDesignTemplate_publish',
  'adminDesignTemplate_unpublish',
  'adminDesignTemplate_archive',
]);

/**
 * The domain declaration, and the eight ids that depend on it.
 *
 * @param read `(key) => string | undefined` over the checker's canonical files
 * @param document the parsed OpenAPI artifact, or undefined
 */
export function checkOperationIdStability(read, document, fail, policyPath) {
  const policy = read('operationIds') ?? '';
  if (!/CONTROLLER_DOMAIN_KEYS/.test(policy)) {
    fail(`${policyPath}: no explicit controller-to-domain declaration`);
  }
  for (const controller of SPLIT_CONTROLLERS) {
    if (!new RegExp(`${controller}: 'adminDesignTemplate'`).test(policy)) {
      fail(`${policyPath}: ${controller} does not declare the adminDesignTemplate domain`);
    }
  }
  for (const id of ACCEPTED_TEMPLATE_OPERATION_IDS) {
    const published = Object.values(document?.paths ?? {}).some((methods) =>
      Object.values(methods).some((operation) => operation.operationId === id),
    );
    if (!published) fail(`the OpenAPI artifact: accepted operation "${id}" is no longer published`);
  }
}

/**
 * The debt the split was authorised to close, measured rather than asserted.
 *
 * Every file carrying the Admin Template surface, against the §6 hard maximum.
 * Read from the shared source authority so a later split is covered without
 * touching this rule.
 */
export function checkSurfaceFileSizes(read, fail) {
  for (const relative of adminTemplateSurfaceFiles()) {
    const source = read(relative);
    if (source === undefined) {
      fail(`${relative}: missing from the Admin Template surface`);
      continue;
    }
    const lines = source.split('\n').length;
    if (lines > RUNTIME_FILE_LIMIT) {
      fail(
        `${relative}: ${String(lines)} lines, over the ${String(RUNTIME_FILE_LIMIT)}-line limit`,
      );
    }
  }
}
