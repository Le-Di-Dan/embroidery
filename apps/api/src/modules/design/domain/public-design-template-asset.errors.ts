/**
 * The safe error contract for published Template asset delivery (`APP3-B05A`).
 *
 * Three codes, and the small number *is* the rule. Every authorization miss
 * collapses into one `PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND`: unknown slug, a
 * `DRAFT` or `ARCHIVED` Template, one unpublished after the fact, a Product that
 * has left the public catalogue, a retired Side or Area, an unknown Version, a
 * historical published Version that is no longer the current one, a Version that
 * exists but was never published, an unknown Asset, an Asset belonging to another
 * Template, an association that exists while the current Version's document no
 * longer references the Asset, a document reference with no durable association,
 * the wrong Asset lane or status, and a derivative that is missing, unready,
 * watermarked, incompletely described or of an unapproved media type.
 *
 * Twelve distinguishable internal reasons, one indistinguishable answer. Each of
 * them is a fact about unreleased or withdrawn store work, and an endpoint that
 * separated them would be an oracle for the Template pipeline — *"that Version
 * used to be public"* leaks as surely as a name would.
 *
 * Messages are written once, here, and never assembled at a call site: this is
 * the only prose that reaches an anonymous browser, so nothing may interpolate a
 * slug, a Version, an Asset id, a bucket, a storage key, a provider name or a
 * column into it.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const PUBLIC_DESIGN_TEMPLATE_ASSET_ERROR_CODES = [
  'PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND',
  'PUBLIC_DESIGN_TEMPLATE_ASSET_INVALID',
  'PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE',
] as const;

export type PublicDesignTemplateAssetErrorCode =
  (typeof PUBLIC_DESIGN_TEMPLATE_ASSET_ERROR_CODES)[number];

const MESSAGES: Record<PublicDesignTemplateAssetErrorCode, string> = {
  PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND: 'That design template asset is not available.',
  PUBLIC_DESIGN_TEMPLATE_ASSET_INVALID: 'The requested design template asset address is not valid.',
  PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE:
    'Design template assets are temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class PublicDesignTemplateAssetError extends Error {
  readonly code: PublicDesignTemplateAssetErrorCode;

  constructor(code: PublicDesignTemplateAssetErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PublicDesignTemplateAssetError';
    this.code = code;
  }
}

export function isPublicDesignTemplateAssetError(
  error: unknown,
): error is PublicDesignTemplateAssetError {
  return error instanceof PublicDesignTemplateAssetError;
}

export function publicDesignTemplateAssetError(
  code: PublicDesignTemplateAssetErrorCode,
): PublicDesignTemplateAssetError {
  return new PublicDesignTemplateAssetError(code);
}

/** The one not-found every authorization miss arrives at. */
export function publicDesignTemplateAssetNotFound(): PublicDesignTemplateAssetError {
  return new PublicDesignTemplateAssetError('PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND');
}

interface ErrorPayload {
  readonly code: PublicDesignTemplateAssetErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<
  PublicDesignTemplateAssetErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND: (payload) => new NotFoundException(payload),
  PUBLIC_DESIGN_TEMPLATE_ASSET_INVALID: (payload) => new BadRequestException(payload),
  // Deliberately not a 404: by the time this can be thrown, the full six-term
  // authorization has already succeeded, so the Template *is* public and the
  // object *should* be there. Reporting a storage outage — or a provider/database
  // size contradiction — as not-found would tell an honest caller to stop asking
  // for something that will exist again once the fault is repaired.
  PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

export function toHttpException(error: PublicDesignTemplateAssetError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
