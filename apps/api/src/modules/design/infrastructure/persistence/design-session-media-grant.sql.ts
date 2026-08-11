/**
 * What gives an authorized Design Session a claim on one Asset's editor-safe
 * bytes (`APP3-S06` §12).
 *
 * `APP3-B06C` shipped with exactly one grant: the `design_session_assets` row
 * `APP3-B06B` writes when the customer uploads. That is complete for a `BLANK`
 * Session and silently incomplete for a `CLONE_TEMPLATE` one — a cloned document
 * arrives already referencing Template artwork, `cloneFromTemplate` writes no
 * association for it, and the delivery route therefore refused to render the
 * customer's own starting design.
 *
 * The second branch is not new authority. `APP3-B08`'s
 * `SessionDocumentMediaAuthority` already decides exactly this pair of sources
 * for *writes*, and this states the same rule for *reads*:
 *
 *   an upload this Session made, **or** an image this Session's persisted
 *   document already references.
 *
 * ## Why the document branch cannot widen anything
 *
 * The obvious objection is that a document is customer-supplied. It is not
 * *arbitrarily* customer-supplied: `APP3-B08`'s allowlist admits a new image
 * reference only when the Asset is in this Session's upload association, so a
 * save can keep or drop what is already there and can never add an Asset the
 * Session did not upload. The only other way a reference enters is
 * `cloneFromTemplate`, and `APP3-B07` validates that document through
 * `validateDesignDocumentContext` before it is stored. The set is therefore
 * closed at both ends, and this predicate reads it rather than extending it.
 *
 * ## Clone lineage is provenance, never permission
 *
 * Nothing below mentions `design_templates`, a Template version, a slug or a
 * publication state. An already-authorized Session keeps rendering its own
 * accepted document after the Template it came from is unpublished, because the
 * grant is the Session's own document — not the Template's continuing
 * visibility. Equally, knowing a Template id grants nothing, because no branch
 * consults one.
 *
 * The reference is matched on the **pair**. A document naming asset A through
 * derivative D authorizes exactly derivative D of asset A: a caller cannot
 * combine an Asset it may see with a derivative it may not.
 */
import { schema } from '@embroidery/database';
import { and, eq, exists, or, sql, type SQL } from 'drizzle-orm';

import { TEMPLATE_ARTWORK_ASSET_KIND } from '../../application/template-document-media.authority';
import {
  SESSION_INTAKE_ASSET_KIND,
  SESSION_INTAKE_CLASSIFICATION,
} from '../../domain/design-session-asset-delivery.policy';

const { designSessions, designSessionAssets, assets, assetDerivatives } = schema;

/**
 * This Session uploaded this Asset itself.
 *
 * The lane pair is asserted here rather than in the shared `WHERE`, and that
 * placement is deliberate: it is a fact about *uploads*. Template artwork is
 * `TEMPLATE_SOURCE`, so requiring `CUSTOMER_UPLOAD` globally would have made the
 * document branch unreachable — the exact bug that would turn this repair into a
 * no-op while every test still passed.
 */
export function uploadGrant(): SQL {
  return and(
    eq(assets.kind, SESSION_INTAKE_ASSET_KIND),
    eq(assets.classification, SESSION_INTAKE_CLASSIFICATION),
    exists(
      // Correlated on both halves of the pair, so an association belonging to
      // another Session can never satisfy it.
      sql`(select 1 from ${designSessionAssets}
            where ${designSessionAssets.sessionId} = ${designSessions.id}
              and ${designSessionAssets.assetId} = ${assets.id})`,
    ),
  ) as SQL;
}

/**
 * This Session's persisted document already places this exact derivative of this
 * exact **Template artwork** Asset.
 *
 * ## Why the lane is part of the grant, not merely a consequence
 *
 * A document is customer-supplied data, and the argument that it is safe to read
 * as a grant rests entirely on `APP3-B08`: its allowlist admits a *new* image
 * reference only for an Asset this Session uploaded, so nothing a customer saves
 * can name a stranger's Asset. That argument is correct today and it is an
 * argument about a different module — one edit away from being false, with the
 * failure being one customer reading another customer's private photograph.
 *
 * So this branch is restricted to `TEMPLATE_SOURCE`, the lane a cloned document
 * can legitimately reference (`association-resolution.service.ts` maps the
 * `TEMPLATE_ASSET` profile to exactly that kind). A customer's private upload is
 * therefore reachable **only** through `uploadGrant`, which is correlated to the
 * association — and a document reference to somebody else's `CUSTOMER_UPLOAD`
 * grants nothing even if one somehow got written. Defence that does not depend
 * on another module continuing to behave.
 *
 * The reference is matched on the pair, so an Asset a Session may see through
 * one derivative cannot be read through another.
 *
 * `jsonb_typeof` guards the array access: `design_document` is `jsonb` and the
 * column contract cannot prove `elements` is an array, and `jsonb_array_elements`
 * on a non-array *errors* rather than returning nothing. A malformed stored
 * document must contribute no grant, not fail the request.
 */
export function documentGrant(derivativeId: SQL): SQL {
  return and(
    eq(assets.kind, TEMPLATE_ARTWORK_ASSET_KIND),
    sql`(
      jsonb_typeof(${designSessions.designDocument} -> 'elements') = 'array'
      and exists (
        select 1
          from jsonb_array_elements(${designSessions.designDocument} -> 'elements') as element
         where element ->> 'type' = 'image'
           and element ->> 'assetId' = ${assets.id}::text
           and element ->> 'derivativeId' = ${derivativeId}::text
      )
    )`,
  ) as SQL;
}

/**
 * Either grant, for a candidate derivative row already in the statement.
 *
 * Both branches are evaluated against the same snapshot as the Session's
 * liveness and the derivative's eligibility, because they are all one `WHERE`.
 */
export function sessionMediaGrant(): SQL {
  return or(uploadGrant(), documentGrant(sql`${assetDerivatives.id}`)) as SQL;
}
