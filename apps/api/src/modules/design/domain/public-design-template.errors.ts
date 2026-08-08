/**
 * The closed error vocabulary of the two public Design Template reads
 * (`APP3-B05`).
 *
 * Two codes, and deliberately no more.
 *
 * `PUBLIC_DESIGN_TEMPLATE_NOT_FOUND` is the single answer to every reason a
 * Template is not publicly readable: no such slug, a `DRAFT`, an `ARCHIVED` one,
 * one that was published and then unpublished, one whose versions were never
 * published, and one whose Product has since left the public catalogue or whose
 * Side or Area has been retired. A public caller must not be able to tell
 * unreleased store work from work that never existed, and any finer answer turns
 * the endpoint into an oracle for the Template pipeline — *"that slug is a
 * draft"* is a leak whether or not it comes with a name attached.
 *
 * That is why there is no `…_NOT_PUBLISHED`, no `…_ARCHIVED` and no
 * `…_SCOPE_INELIGIBLE`: the shape of this file is the non-disclosure rule.
 *
 * Nothing here interpolates a slug, an id, a status, a scope id or a column name
 * into a message.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const PUBLIC_DESIGN_TEMPLATE_ERROR_CODES = [
  /** Unknown, draft, archived, unpublished, or no longer publicly scoped — one answer. */
  'PUBLIC_DESIGN_TEMPLATE_NOT_FOUND',
  /** The cursor is malformed, tampered with, or was issued for another scope. */
  'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',
] as const;

export type PublicDesignTemplateErrorCode = (typeof PUBLIC_DESIGN_TEMPLATE_ERROR_CODES)[number];

export class PublicDesignTemplateError extends Error {
  constructor(
    readonly code: PublicDesignTemplateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublicDesignTemplateError';
  }
}

export function isPublicDesignTemplateError(error: unknown): error is PublicDesignTemplateError {
  return error instanceof PublicDesignTemplateError;
}

export function publicDesignTemplateNotFound(): PublicDesignTemplateError {
  return new PublicDesignTemplateError(
    'PUBLIC_DESIGN_TEMPLATE_NOT_FOUND',
    'That design template is not available.',
  );
}

export function publicDesignTemplateCursorInvalid(): PublicDesignTemplateError {
  return new PublicDesignTemplateError(
    'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',
    'The supplied pagination cursor is not valid.',
  );
}

interface ErrorPayload {
  readonly code: PublicDesignTemplateErrorCode;
  readonly message: string;
}

/**
 * Maps the transport-free domain error onto the canonical HTTP exception.
 *
 * Both are 4xx: the code travels in the envelope and 4xx survives the global
 * exception filter unredacted, whereas a 5xx would reach the client as
 * `INTERNAL_SERVER_ERROR` and say nothing at all.
 */
const STATUS_BY_CODE: Record<
  PublicDesignTemplateErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  PUBLIC_DESIGN_TEMPLATE_NOT_FOUND: (payload) => new NotFoundException(payload),
  PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID: (payload) => new BadRequestException(payload),
};

export function toHttpException(error: PublicDesignTemplateError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
