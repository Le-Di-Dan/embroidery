/**
 * The frozen production specification, presented as the read-only authority it
 * is (`784:47`, `785:314`).
 *
 * ## Every value comes from the detail response, and only from there
 *
 * `production_specifications` is a copy taken from the exact approval snapshot
 * at job creation (Class F, INV-12). A product renamed in the catalog afterwards
 * does not change what is produced, so this module reads the API's own fields
 * and never reaches for a live Catalog, Product, Design Session, quotation or
 * approval read to "enrich" one. There is no fallback lookup anywhere: an absent
 * optional field is rendered as the approved em dash with the reason, never
 * reconstructed.
 *
 * ## The two absences are meanings, not gaps
 *
 * - `variantLabel` is **always** absent for a customer-owned product (INV-13),
 *   so its em dash carries that reason rather than a generic "không có"
 *   (`785:330`).
 * - `productionParameters` is free text recorded at creation; a job created
 *   without machine parameters has none, which the frame states as such
 *   (`785:350`).
 *
 * ## The dimensions are not arithmetic
 *
 * `physicalWidthMm` and `physicalHeightMm` are transported exactly as `numeric`
 * stores them. They are joined with the approved `×` and the unit and are never
 * parsed, rounded, converted or recomputed — a millimetre figure an operator
 * sets a machine from must be the stored one, character for character.
 */
import type { AdminProductionSpecificationResponse } from '@embroidery/api-client';

import { PRODUCTION_JOB_COPY as COPY } from './production-job-copy';

export interface SpecificationField {
  readonly label: string;
  readonly value: string;
  /** True when the value is an approved absence rather than a stored figure. */
  readonly absent: boolean;
}

/** The stored width and height, joined without touching either string. */
export function formatPhysicalSize(spec: AdminProductionSpecificationResponse): string {
  return `${spec.physicalWidthMm} × ${spec.physicalHeightMm} mm`;
}

/**
 * The six grid fields in the order the approved desktop frame lays them out
 * (`784:57`, `784:67`). The narrow reference reflows the same six into two
 * columns (`789:217`) — same fields, same order, so the reflow is a stylesheet
 * concern rather than a second list.
 */
export function toSpecificationFields(
  spec: AdminProductionSpecificationResponse,
): readonly SpecificationField[] {
  const variant = spec.variantLabel;
  return [
    { label: COPY.specification.productName, value: spec.productName, absent: false },
    variant === undefined
      ? {
          label: COPY.specification.variantLabel,
          value: COPY.specification.variantAbsent,
          absent: true,
        }
      : { label: COPY.specification.variantLabel, value: variant, absent: false },
    { label: COPY.specification.sideName, value: spec.sideName, absent: false },
    { label: COPY.specification.areaName, value: spec.areaName, absent: false },
    { label: COPY.specification.dimensions, value: formatPhysicalSize(spec), absent: false },
    {
      label: COPY.specification.quantityTotal,
      value: String(spec.quantityTotal),
      absent: false,
    },
  ];
}

/** The machine parameters, or the approved statement that none were recorded. */
export function productionParametersOf(
  spec: AdminProductionSpecificationResponse,
): SpecificationField {
  const parameters = spec.productionParameters;
  return parameters === undefined
    ? {
        label: COPY.specification.productionParameters,
        value: COPY.specification.parametersAbsent,
        absent: true,
      }
    : {
        label: COPY.specification.productionParameters,
        value: parameters,
        absent: false,
      };
}
