/**
 * The published status for each design-version authoring refusal
 * (`APP6-B08` §13).
 *
 * An exhaustive `Record` rather than a switch: adding a code without giving it a
 * status stops compiling, which is the only way a new refusal cannot reach a
 * client as an unmapped 500.
 *
 * The statuses are chosen per code rather than per class. `409` is used where
 * the request exists and the operator's action is legitimate but the *state* is
 * not — an eligibility refusal is answered by moving the request, and a `400`
 * would tell the operator to fix a body that is fine. `422` is used where the
 * body itself is the problem. `DESIGN_CASE_UNRESOLVED` and
 * `CATALOG_PLACEMENT_UNRESOLVED` are `409` as well: nothing the caller sends can
 * repair either, and a `404` would say the request does not exist when it does.
 *
 * Each message names only what the operator already knows: the request they
 * addressed and the shape of the problem. No constraint name, no column, no
 * customer value and no id they did not type appears in any of them.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

import {
  DesignVersionAuthoringError,
  type DesignVersionAuthoringErrorCode,
} from '../domain/design-version-authoring.errors';

const RESPONSE_OF: Readonly<
  Record<DesignVersionAuthoringErrorCode, (detail: string | undefined) => HttpException>
> = {
  REQUEST_NOT_FOUND: () =>
    new HttpException(
      { code: 'REQUEST_NOT_FOUND', message: 'No such custom request.' },
      HttpStatus.NOT_FOUND,
    ),
  REQUEST_NOT_DIGITIZING: () =>
    new HttpException(
      {
        code: 'REQUEST_NOT_DIGITIZING',
        message:
          'A design version may only be created while the request is being digitized or reviewed.',
      },
      HttpStatus.CONFLICT,
    ),
  DESIGN_CASE_UNRESOLVED: () =>
    new HttpException(
      {
        code: 'DESIGN_CASE_UNRESOLVED',
        message: 'This request has no resolvable design case.',
      },
      HttpStatus.CONFLICT,
    ),
  CATALOG_PLACEMENT_UNRESOLVED: () =>
    new HttpException(
      {
        code: 'CATALOG_PLACEMENT_UNRESOLVED',
        message:
          'This request no longer resolves to a complete catalog placement, so no version can be ' +
          'authored against it. Nothing was substituted.',
      },
      HttpStatus.CONFLICT,
    ),
  PLACEMENT_INPUT_INVALID: () =>
    new HttpException(
      {
        code: 'PLACEMENT_INPUT_INVALID',
        message:
          'The placement details do not match this request. A catalog request derives its ' +
          'placement from the request itself; a customer-owned request requires both placement ' +
          'labels and a positive placement envelope.',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  // `404`, and the same body an unknown request gets in spirit: the operator
  // addressed something that, as far as this route is concerned, does not
  // exist. No id they did not type appears, and nothing distinguishes an absent
  // version from one belonging to another request's design case.
  DESIGN_VERSION_NOT_FOUND: () =>
    new HttpException(
      {
        code: 'DESIGN_VERSION_NOT_FOUND',
        message: 'No such design version on this request.',
      },
      HttpStatus.NOT_FOUND,
    ),
  DOCUMENT_REJECTED: (detail) =>
    new HttpException(
      {
        code: 'DOCUMENT_REJECTED',
        message: 'The design document was rejected.',
        // The P01/P02 rejection class, which names *how* the document failed.
        // Never the findings themselves: a finding path can quote customer text
        // and an element id, and neither belongs in an error body.
        ...(detail === undefined ? {} : { reason: detail }),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedDesignVersionAction<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof DesignVersionAuthoringError) {
      throw RESPONSE_OF[error.code](error.detail);
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a response
    // by this file.
    throw error;
  }
}
