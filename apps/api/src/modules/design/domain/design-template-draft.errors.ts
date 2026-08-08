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
  type HttpException,
} from '@nestjs/common';

export const DESIGN_TEMPLATE_DRAFT_ERROR_CODES = [
  'DESIGN_TEMPLATE_NOT_FOUND',
  'DESIGN_TEMPLATE_DRAFT_INVALID',
  'DESIGN_TEMPLATE_SCOPE_INVALID',
  'DESIGN_TEMPLATE_SCOPE_INCOMPLETE',
  'DESIGN_TEMPLATE_SLUG_CONFLICT',
  'DESIGN_TEMPLATE_CURSOR_INVALID',
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
    case 'DESIGN_TEMPLATE_SLUG_CONFLICT':
      return new ConflictException(error.message);
    default:
      return new BadRequestException(error.message);
  }
}
