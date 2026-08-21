/**
 * The truthful display, quantity and contact evidence an Approval Snapshot
 * freezes (`APP6-B11` §11).
 *
 * `approval_snapshots` has four `NOT NULL` display copies (`product_name`,
 * `side_name`, `area_name`) plus a positive `quantity_total`, and three nullable
 * `[PII]` contact copies. None of them is a foreign key — they are Class F
 * frozen copies (INV-12 / CON-018), captured so a later product rename, variant
 * retirement or contact change cannot rewrite what the customer approved. This
 * class is the one place they are assembled, and its whole discipline is that
 * every value is *read from somewhere real or refused*.
 *
 * ### Two branches, two sources, and no substitution between them
 *
 * ```text
 * CATALOG         product_name  ← CATALOG_SUBJECT_PORT (products.name)
 *                 variant_label ← color_name / size_label, as stored
 *                 side_name     ← product_sides.name
 *                 area_name     ← embroidery_areas.name
 *
 * CUSTOMER_OWNED  product_name  ← customer_owned_products.name
 *                 variant_label ← absent; a COP has no variant
 *                 side_name     ← design_versions.placement_side_label
 *                 area_name     ← design_versions.placement_area_label
 * ```
 *
 * A customer-owned product is **never a SKU** (INV-13), so no Catalog row is
 * consulted, invented or borrowed for it — that is the entire point of
 * `ADR-APP6-001` and of migration `0036`. In the other direction,
 * `customer_owned_products.description` is never adopted as a placement label:
 * it describes the *item*, and using it would fabricate in text exactly what the
 * nullable FKs stop fabricating in identity. The two labels come from the
 * version, where CST-130 has already required them to be present and non-blank
 * on this branch.
 *
 * ### Nothing is defaulted
 *
 * Every absence is `APPROVAL_EVIDENCE_UNRESOLVED` rather than a placeholder.
 * There is no `?? 'Unknown'`, no `?? ''` and no fallback of a Catalog label onto
 * a COP row anywhere below. This is immutable evidence that authorises an order,
 * a production job and a machine file; a snapshot that said "Unknown" would
 * satisfy the `NOT NULL` and be worth nothing, and one that borrowed a
 * neighbouring product's name would be worse than worthless. Each of these
 * absences is unreachable through the delivered paths — every placement FK is
 * `restrict`, CST-130 forces both COP labels, and a submitted request always
 * carries a quantity breakdown — which is precisely why the refusal costs
 * nothing and the fallback would only ever fire on a defect.
 *
 * ### The contact copy is read, never masked and never re-derived
 *
 * `contact_name`/`contact_email`/`contact_phone` are the customer's details *as
 * they stood at approval*, so `AdminCustomerSummaryPort`'s masked projection is
 * exactly the wrong source. The raw contacts are read through
 * `CUSTOMER_REPOSITORY`, which the composing module already holds for the
 * step-up resolver's sake. Only **verified and not deactivated** contacts are
 * frozen: a contact the customer removed must stop appearing in new evidence at
 * the moment it is removed, and an unverified one has proved nothing. The
 * primary contact of each kind wins, then the first verified one, so a customer
 * with two emails freezes the one they nominated rather than whichever the index
 * returned first.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type CustomerId,
  type CustomerRepository,
} from '../../../customer/domain/repositories/customer.repository';
import {
  CATALOG_SUBJECT_PORT,
  type CatalogSubjectPort,
} from '../../../catalog/domain/repositories/catalog-subject.port';
import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../../../catalog/domain/repositories/product-placement.repository';
import {
  CUSTOM_REQUEST_APPROVAL_FACTS_PORT,
  type CustomRequestApprovalFactsPort,
} from '../../../order/domain/repositories/custom-request-approval-facts.port';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import { designDecisionError } from '../../domain/review/design-decision.errors';
import { approvalThreadColorsOf } from '../../domain/review/approval-thread-colors';
import type { ApprovalThreadColor } from '../../domain/review/approval-thread-colors';
import type { DesignVersion } from '../../domain/repositories/design-case.repository';

/** Everything the snapshot needs that is not already on the version row. */
export interface ApprovalEvidence {
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  readonly quantityTotal: number;
  readonly contactName: string | undefined;
  readonly contactEmail: string | undefined;
  readonly contactPhone: string | undefined;
  readonly threadColors: readonly ApprovalThreadColor[];
}

/** The separator DB4 declines to store, applied only where both parts exist. */
const VARIANT_LABEL_SEPARATOR = ' / ';

@Injectable()
export class ApprovalEvidenceResolver {
  constructor(
    @Inject(CATALOG_SUBJECT_PORT) private readonly subjects: CatalogSubjectPort,
    @Inject(PRODUCT_PLACEMENT_REPOSITORY) private readonly placements: ProductPlacementRepository,
    @Inject(CUSTOM_REQUEST_APPROVAL_FACTS_PORT)
    private readonly requests: CustomRequestApprovalFactsPort,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  /**
   * Assembles the evidence for one exact version, or refuses.
   *
   * @requiresTransaction — joins the approval's transaction, so the facts frozen
   * are the facts that were true when it committed.
   */
  async resolve(
    version: DesignVersion,
    customRequestId: CustomRequestId,
    customerId: string,
  ): Promise<ApprovalEvidence> {
    const facts = await this.requests.findApprovalFacts(customRequestId);
    // `ck_approval_snapshots__quantity_positive`. A request with no lines cannot
    // be frozen, and `1` is not a safe guess about how many garments someone
    // ordered.
    if (facts === undefined || facts.quantityTotal <= 0) {
      throw designDecisionError('APPROVAL_EVIDENCE_UNRESOLVED');
    }

    const labels =
      version.placement.branch === 'CUSTOMER_OWNED'
        ? this.customerOwnedLabels(version, facts.customerOwnedProductName)
        : await this.catalogLabels(version);

    const contact = await this.contactEvidence(customerId as CustomerId);

    return {
      ...labels,
      quantityTotal: facts.quantityTotal,
      ...contact,
      // Derived from the version's own frozen document — the bytes
      // `document_hash` was computed over at send — and never from the request
      // body. See `approval-thread-colors.ts` for why there is no palette
      // lookup and no invented thread code.
      threadColors: approvalThreadColorsOf(version.designDocument),
    };
  }

  /** The Catalog quartet's four live display strings, or a refusal. */
  private async catalogLabels(
    version: DesignVersion,
  ): Promise<Pick<ApprovalEvidence, 'productName' | 'variantLabel' | 'sideName' | 'areaName'>> {
    if (version.placement.branch !== 'CATALOG') {
      // Unreachable: the caller branched on the same discriminator. Stated
      // rather than asserted, so a future branch cannot silently fall through
      // into a Catalog read with null ids.
      throw designDecisionError('APPROVAL_EVIDENCE_UNRESOLVED');
    }
    const placement = version.placement;

    const subject = await this.subjects.findSubjectLabels({
      productId: placement.productId,
      productVariantId: placement.productVariantId,
    });
    // The port answers `undefined` when either row is absent **or** the variant
    // does not belong to the product, so a mismatched pair cannot be labelled as
    // though it were coherent.
    if (subject === undefined) {
      throw designDecisionError('APPROVAL_EVIDENCE_UNRESOLVED');
    }

    // One read for the product's whole placement, then two lookups by id.
    // `findPlacement` returns retired rows too, which is what this needs: a
    // side retired after the design was authored still has the name the
    // customer approved against, and refusing to freeze it would make retiring a
    // side break every open review of it.
    const snapshot = await this.placements.findPlacement(placement.productId);
    const side = snapshot?.sides.find((row) => row.id === placement.productSideId);
    const area = snapshot?.areas.find((row) => row.id === placement.embroideryAreaId);
    if (side === undefined || area === undefined) {
      throw designDecisionError('APPROVAL_EVIDENCE_UNRESOLVED');
    }

    return {
      productName: subject.productName,
      variantLabel: variantLabelOf(subject.variantColorName, subject.variantSizeLabel),
      sideName: side.name,
      areaName: area.name,
    };
  }

  /** The customer's own words for their item, and the version's frozen labels. */
  private customerOwnedLabels(
    version: DesignVersion,
    customerOwnedProductName: string | undefined,
  ): Pick<ApprovalEvidence, 'productName' | 'variantLabel' | 'sideName' | 'areaName'> {
    if (version.placement.branch !== 'CUSTOMER_OWNED' || customerOwnedProductName === undefined) {
      throw designDecisionError('APPROVAL_EVIDENCE_UNRESOLVED');
    }
    return {
      productName: customerOwnedProductName,
      // Not `null` because a COP variant could not be found — because a COP has
      // no variant at all. The column is nullable for exactly this row.
      variantLabel: undefined,
      sideName: version.placement.sideLabel,
      areaName: version.placement.areaLabel,
    };
  }

  /** The customer's display name and their best verified contact of each kind. */
  private async contactEvidence(
    customerId: CustomerId,
  ): Promise<Pick<ApprovalEvidence, 'contactName' | 'contactEmail' | 'contactPhone'>> {
    const customer = await this.customers.findById(customerId);
    const contacts = (await this.customers.listContactPoints(customerId)).filter(isFreezable);

    return {
      // Absent rather than invented: `display_name` is nullable on TBL-004 and a
      // customer who never gave a name is recorded as not having given one.
      contactName: customer?.displayName,
      contactEmail: bestOf(contacts, 'EMAIL'),
      contactPhone: bestOf(contacts, 'PHONE'),
    };
  }
}

/**
 * A contact that may be frozen into approval evidence.
 *
 * The same two tests `StepUpEvidenceResolver` applies, for the same reasons:
 * verified, because an unverified contact has proved nothing; and not
 * deactivated, because a contact the customer removed must stop appearing in new
 * records at the moment it is removed.
 */
function isFreezable(contact: ContactPoint): boolean {
  return contact.verifiedAt !== undefined && contact.deactivatedAt === undefined;
}

/** The primary contact of a kind, else the first verified one, else nothing. */
function bestOf(contacts: readonly ContactPoint[], kind: string): string | undefined {
  const ofKind = contacts.filter((contact) => contact.contactKind === kind);
  const chosen = ofKind.find((contact) => contact.isPrimary) ?? ofKind[0];
  // The **display** form, not the normalized one: this is evidence of how the
  // customer was reachable, and the normalized value is a comparison key that
  // has had case and punctuation removed.
  return chosen?.displayValue;
}

/**
 * The two variant attributes as one label, or nothing.
 *
 * `product_variants` has no `name` — DB4 locked two nullable relational columns
 * instead — so the separator lives here, at the one place that renders them
 * together, and is applied only when both halves exist. A variant carrying only
 * a size freezes the size, not `" / L"`.
 */
function variantLabelOf(
  colorName: string | undefined,
  sizeLabel: string | undefined,
): string | undefined {
  const parts = [colorName, sizeLabel].filter(
    (part): part is string => part !== undefined && part.trim() !== '',
  );
  return parts.length === 0 ? undefined : parts.join(VARIANT_LABEL_SEPARATOR);
}
