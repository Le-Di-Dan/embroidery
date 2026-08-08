/**
 * The feature-owned safe error contract for Admin Design Template authoring
 * (`APP3-B03` §12).
 *
 * Same shape as the Catalog product-draft contract it sits beside: a
 * transport-free error carried as data and translated to an HTTP exception at
 * exactly one point. Deep in a repository there is no HTTP, and a persistence
 * layer that threw `ConflictException` would be a persistence layer that knows
 * about status codes.
 *
 * Every message here is the only free text that reaches a browser, so it is
 * written once and never interpolated at a call site. None names a table, a
 * column, a constraint, an actor, a storage fact or which half of a scope chain
 * failed — an Admin who supplied a Side belonging to another Product learns the
 * scope is unusable, not the shape of the catalog.
 *
 * There is deliberately **no** version, document, publication or association
 * code here. `APP3-B03` creates a header and reads; the draft document save and
 * its version semantics are `APP3-B03A`, and publication is `APP3-B04`.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  type HttpException,
} from '@nestjs/common';

export const DESIGN_TEMPLATE_DRAFT_ERROR_CODES = [
  'DESIGN_TEMPLATE_NOT_FOUND',
  'DESIGN_TEMPLATE_DRAFT_INVALID',
  'DESIGN_TEMPLATE_SCOPE_INVALID',
  'DESIGN_TEMPLATE_SCOPE_INCOMPLETE',
  'DESIGN_TEMPLATE_SLUG_CONFLICT',
  'DESIGN_TEMPLATE_CURSOR_INVALID',
  // `APP3-B03A` — the draft document save. Added to this vocabulary rather than
  // given one of their own so the feature keeps a single error type and a single
  // translation point.
  'DESIGN_TEMPLATE_NOT_EDITABLE',
  'DESIGN_TEMPLATE_VERSION_CONFLICT',
  // `APP3-B04` — the LC-24 lifecycle transitions. Added to this vocabulary for
  // the same reason B03A's were: one error type and one translation point.
  //
  // The two are semantically distinct and must not be collapsed. A source state
  // that forbids the transition is a **conflict** the Admin can resolve by
  // reloading; a template that is in the right state but not *ready* to publish
  // is an **unprocessable** request the Admin resolves by fixing the template.
  'DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED',
  'DESIGN_TEMPLATE_PUBLISH_NOT_READY',
] as const;

export type DesignTemplateDraftErrorCode = (typeof DESIGN_TEMPLATE_DRAFT_ERROR_CODES)[number];

const MESSAGES: Record<DesignTemplateDraftErrorCode, string> = {
  DESIGN_TEMPLATE_NOT_FOUND: 'That design template does not exist.',
  DESIGN_TEMPLATE_DRAFT_INVALID: 'The design template request is missing or not permitted.',
  DESIGN_TEMPLATE_SCOPE_INVALID: 'That product, side and area combination is not available.',
  DESIGN_TEMPLATE_SCOPE_INCOMPLETE:
    'A design template scope needs the product, the side and the area together.',
  DESIGN_TEMPLATE_SLUG_CONFLICT: 'A template address could not be reserved for this name.',
  DESIGN_TEMPLATE_CURSOR_INVALID: 'The supplied pagination cursor is not valid.',
  DESIGN_TEMPLATE_NOT_EDITABLE: 'This design template is not in a state that allows editing.',
  DESIGN_TEMPLATE_VERSION_CONFLICT:
    'This design template changed since it was loaded. Reload and try again.',
  DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED:
    'This design template cannot make that change from its current state.',
  DESIGN_TEMPLATE_PUBLISH_NOT_READY: 'This design template is not ready to be published yet.',
};

/**
 * The error every template-draft failure is expressed as before it becomes an
 * `HttpException`.
 *
 * A real `Error` subclass, exactly as `ProductDraftError` is: a plain tagged
 * object would carry no stack, would be rejected by
 * `@typescript-eslint/only-throw-error`, and would not survive an `instanceof`
 * narrowing — which is the check the single translation point relies on.
 */
export class DesignTemplateDraftError extends Error {
  readonly code: DesignTemplateDraftErrorCode;

  constructor(code: DesignTemplateDraftErrorCode) {
    super(MESSAGES[code]);
    this.name = 'DesignTemplateDraftError';
    this.code = code;
  }
}

export function designTemplateDraftError(
  code: DesignTemplateDraftErrorCode,
): DesignTemplateDraftError {
  return new DesignTemplateDraftError(code);
}

export function isDesignTemplateDraftError(value: unknown): value is DesignTemplateDraftError {
  return value instanceof DesignTemplateDraftError;
}

/**
 * The one place a template-draft error becomes a status code.
 *
 * A scope that names rows which do not resolve is a **400**, not a 404: the
 * request is malformed against the catalog rather than addressing a template
 * that is missing, and answering 404 would let a caller probe which Side ids
 * exist by watching the code change.
 */
export function toHttpException(error: DesignTemplateDraftError): HttpException {
  switch (error.code) {
    case 'DESIGN_TEMPLATE_NOT_FOUND':
      return new NotFoundException(error.message);
    // A save the caller may retry after reloading, and a lifecycle state that
    // forbids editing, are both conflicts rather than bad requests: the body was
    // well formed and the server state is what refused it.
    case 'DESIGN_TEMPLATE_SLUG_CONFLICT':
    case 'DESIGN_TEMPLATE_NOT_EDITABLE':
    case 'DESIGN_TEMPLATE_VERSION_CONFLICT':
    case 'DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED':
      return new ConflictException(error.message);
    // Readiness is not a conflict: the request was well formed and the state was
    // right; the template itself is what could not be published.
    case 'DESIGN_TEMPLATE_PUBLISH_NOT_READY':
      return new UnprocessableEntityException(error.message);
    default:
      return new BadRequestException(error.message);
  }
}
