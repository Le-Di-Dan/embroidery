import { AdminDesignTemplateListStatus } from '@embroidery/api-client';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';

interface DesignTemplateStatusBadgeProps {
  readonly status: string;
}

/**
 * The lifecycle state of one template (`596:8`).
 *
 * The label is always rendered as text, never encoded in colour alone: colour is
 * a redundant cue here, not the message. An operator who cannot distinguish the
 * badge tints still reads "Bản nháp".
 *
 * The status arrives as a string and is matched against the contract's enum
 * rather than trusted. `LC-24` may add a state before this screen learns about
 * it, and rendering an unknown value verbatim would put a raw server token in
 * front of an operator; an unmapped state degrades to a neutral label instead.
 *
 * Derived from `status` alone — never inferred from version data, which the list
 * does not carry anyway.
 */
export function DesignTemplateStatusBadge({ status }: DesignTemplateStatusBadgeProps) {
  const label = {
    [AdminDesignTemplateListStatus.DRAFT]: DESIGN_TEMPLATE_COPY.status.draft,
    [AdminDesignTemplateListStatus.PUBLISHED]: DESIGN_TEMPLATE_COPY.status.published,
    [AdminDesignTemplateListStatus.ARCHIVED]: DESIGN_TEMPLATE_COPY.status.archived,
  }[status];

  const known = label !== undefined;
  const modifier = known ? status.toLowerCase() : 'unknown';

  return (
    <span
      className={`design-template-status design-template-status--${modifier}`}
      data-status={known ? status : 'UNKNOWN'}
    >
      {label ?? DESIGN_TEMPLATE_COPY.status.unknown}
    </span>
  );
}
