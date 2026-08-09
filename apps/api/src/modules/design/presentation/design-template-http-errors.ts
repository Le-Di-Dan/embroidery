/**
 * The single translation point from the Design Template feature's transport-free
 * error types to the canonical HTTP exception.
 *
 * Extracted from the controller by `APP3-B04A` when that surface was split into
 * an authoring controller and a lifecycle controller. Two controllers each
 * carrying their own copy of this would be two places for the mapping to drift,
 * and the mapping is the whole reason a stale compare-and-set answers 409 rather
 * than 500.
 *
 * Anything that is not one of these types propagates untouched and is sanitised
 * by the platform filter, which is the correct treatment for an unreviewed
 * failure.
 */
import { UnprocessableEntityException } from '@nestjs/common';

import { TemplateNotPublishableError } from '../application/design-template-lifecycle.use-case';
import { TemplateDocumentRejectedError } from '../application/save-template-document.use-case';
import {
  isDesignTemplateDraftError,
  toHttpException,
} from '../domain/design-template-draft.errors';

/**
 * Runs one controller action, translating the feature's refusals.
 *
 * A refused document and a template that is not ready to publish are both
 * **422**: the request was well formed and the server understood it, and the
 * *content* — a document, or a template's readiness — is what could not be
 * accepted. Restore has no 422 of its own, because it runs no readiness guard.
 */
export async function guardedTemplateOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (
      error instanceof TemplateDocumentRejectedError ||
      error instanceof TemplateNotPublishableError
    ) {
      throw new UnprocessableEntityException(error.message);
    }
    throw isDesignTemplateDraftError(error) ? toHttpException(error) : error;
  }
}
