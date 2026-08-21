/**
 * Reader for the `APP6-G01-C1` agreement-content dataset (`APP6-B10`).
 *
 * The JSON at `packages/database/seed/app6-agreement-content.seed.json` stays
 * the **single source** of every customer-facing agreement sentence. This module
 * reads it and validates its shape; it restates no sentence, and adding a
 * default here would defeat the reason the dataset exists — `APP6-G01-C1` §5.4
 * routed the reader and the publishing caller to `APP6-B10` exactly as
 * `APP6-G01` §6.5 routed the policy dataset's to `APP6-B01`.
 *
 * It is a sibling of {@link loadApp6PolicyDataset}, not a generalisation of it,
 * for the reason `PublishApp6PolicyUseCase` records about its own APP4 sibling:
 * merging two readers into a dataset registry is the seed framework neither
 * checkpoint was asked to build. The two share only `seedFolderFrom`, which is
 * the one genuinely common mechanic.
 *
 * The folder is resolved from a caller-supplied `package.json` path for the
 * reason `loadApp4PolicyDataset` records: resolving it from `import.meta.url`
 * would make this module ESM-only, and the CommonJS NestJS applications could
 * then not import `@embroidery/database` at all.
 *
 * This is a reader, not a seed runner. It knows one dataset, applies no
 * ordering, opens no connection and writes nothing — publication is the API
 * bootstrap's, because only that side holds an Admin identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { seedFolderFrom } from './app4-policy-dataset';

/** The dataset file name. The content source, and the only one. */
export const APP6_AGREEMENT_CONTENT_DATASET_FILE = 'app6-agreement-content.seed.json';

/**
 * The agreement types the dataset carries, in dataset order.
 *
 * This is **not** the required set. Which types design approval requires is
 * `design_approval.agreements` policy configuration read at the point of use
 * (`APP6-G01-C1` §5.1); this list is only what content exists for. They agree
 * today and the reader deliberately does not assert that they must: a type
 * published with content but not currently required is legitimate, and asserting
 * the equality here would put the required set in two places.
 */
export const APP6_AGREEMENT_CONTENT_TYPES = ['PAYMENT_POLICY', 'RETURN_POLICY'] as const;

export type App6AgreementContentType = (typeof APP6_AGREEMENT_CONTENT_TYPES)[number];

export type App6AgreementContent = {
  readonly agreementType: App6AgreementContentType;
  /** The container's display name — `agreements.name`, never the legal text. */
  readonly name: string;
  /** BCP-47 language tag. `DB3_AGREEMENT_ACCEPTANCE_SPEC` §2.3 locks MVP `vi`. */
  readonly language: string;
  /** The authority section this block was normalized from, for review. */
  readonly authoritySection: string;
  /** The exact customer-facing text, published verbatim. */
  readonly content: string;
};

export type App6AgreementContentDataset = {
  readonly seedId: string;
  readonly tier: string;
  readonly language: string;
  readonly agreements: readonly App6AgreementContent[];
};

/**
 * Reads and validates the dataset.
 *
 * The validation is structural rather than semantic: it proves the file is the
 * dataset this reader expects — known types, each declared once, each carrying a
 * non-blank name, language and content — without asserting a sentence, a count
 * or a phrase, which would be restating the content it exists to avoid
 * duplicating. A publisher that received blank content would write an agreement
 * a customer is asked to accept and cannot read, so blankness is the one content
 * property checked here.
 */
export function loadApp6AgreementContentDataset(
  packageJsonPath: string,
): App6AgreementContentDataset {
  const file = join(seedFolderFrom(packageJsonPath), APP6_AGREEMENT_CONTENT_DATASET_FILE);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${APP6_AGREEMENT_CONTENT_DATASET_FILE} is not an object.`);
  }
  const record = parsed as Record<string, unknown>;
  const agreements = record['agreements'];
  if (!Array.isArray(agreements)) {
    throw new Error(`${APP6_AGREEMENT_CONTENT_DATASET_FILE} has no agreements array.`);
  }

  const seen = new Set<string>();
  for (const entry of agreements) {
    const agreement = entry as Partial<App6AgreementContent>;
    const type = agreement.agreementType;
    if (type === undefined || !(APP6_AGREEMENT_CONTENT_TYPES as readonly string[]).includes(type)) {
      throw new Error(
        `${APP6_AGREEMENT_CONTENT_DATASET_FILE} carries an unknown agreement type "${String(type)}".`,
      );
    }
    if (seen.has(type)) {
      throw new Error(`${APP6_AGREEMENT_CONTENT_DATASET_FILE} declares "${type}" more than once.`);
    }
    seen.add(type);
    requireText(agreement.name, type, 'name');
    requireText(agreement.language, type, 'language');
    requireText(agreement.authoritySection, type, 'authority section');
    requireText(agreement.content, type, 'content');
  }
  for (const type of APP6_AGREEMENT_CONTENT_TYPES) {
    if (!seen.has(type)) {
      throw new Error(`${APP6_AGREEMENT_CONTENT_DATASET_FILE} is missing "${type}".`);
    }
  }

  return parsed as App6AgreementContentDataset;
}

/** A present, non-blank string, or a named failure the operator can act on. */
function requireText(value: unknown, type: string, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${APP6_AGREEMENT_CONTENT_DATASET_FILE}: "${type}" has no ${field}.`);
  }
}
