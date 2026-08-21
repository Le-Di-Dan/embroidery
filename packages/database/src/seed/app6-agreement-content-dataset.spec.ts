/**
 * The committed `APP6-G01-C1` agreement content, checked against the authority
 * that produced it (`APP6-B10` §11).
 *
 * Two properties, and the second is the one that matters. The reader's own
 * validation proves the file is *shaped* like the dataset; this proves the file
 * *says what the authority says* — every sentence of `§5.6.1` and `§5.6.2`,
 * verbatim, in order, with nothing added.
 *
 * The comparison is built by re-extracting the blocks from the authority
 * markdown rather than by restating them here. A copy of the eleven and twelve
 * sentences in this file would be a third place the policy lived, and the first
 * to drift; extracting them makes "published verbatim" a fact about the
 * authority document rather than about whoever last edited a test fixture.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP6_AGREEMENT_CONTENT_TYPES,
  loadApp6AgreementContentDataset,
} from './app6-agreement-content-dataset';

const COMMITTED_PACKAGE_JSON = join(__dirname, '../../package.json');

const AUTHORITY = join(
  __dirname,
  '../../../../docs/implementation/audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md',
);

/** The heading that opens each canonical content block in the authority. */
const SECTION_HEADINGS: Readonly<Record<string, string>> = {
  PAYMENT_POLICY: '#### 5.6.1',
  RETURN_POLICY: '#### 5.6.2',
};

/**
 * The blockquote under one authority heading, as plain text.
 *
 * Blockquote markers and markdown emphasis are removed and wrapped lines are
 * rejoined; nothing else is touched. Emphasis is the only markdown inside the
 * blocks and it carries no meaning a customer reading plain text would lose —
 * `**P1.**` and `P1.` are the same sentence label.
 */
function authorityBlock(agreementType: string): string {
  const lines = readFileSync(AUTHORITY, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(SECTION_HEADINGS[agreementType] ?? ''));
  const end = lines.findIndex((line, index) => index > start && line.includes('| Sentence |'));
  const quoted = lines
    .slice(start + 1, end)
    .filter((line) => line.startsWith('>'))
    .map((line) => line.replace(/^>\s?/, ''));

  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of quoted) {
    if (line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      continue;
    }
    current.push(line.trim());
  }
  if (current.length > 0) paragraphs.push(current.join(' '));

  return paragraphs.map((paragraph) => paragraph.replace(/\*\*/g, '')).join('\n\n');
}

describe('the APP6-G01-C1 agreement content dataset', () => {
  const dataset = loadApp6AgreementContentDataset(COMMITTED_PACKAGE_JSON);

  it('carries exactly the two agreement types the authority locks', () => {
    expect(dataset.agreements.map((agreement) => agreement.agreementType)).toEqual([
      'PAYMENT_POLICY',
      'RETURN_POLICY',
    ]);
    // `APP6-G01-C1` §5.2 rules the exact-design confirmation out of the
    // agreement model entirely: it is approval action semantics enforced by
    // GRD-007, and no third type may be invented to store it.
    expect(APP6_AGREEMENT_CONTENT_TYPES).not.toContain('DESIGN_APPROVAL_TERMS');
    expect(JSON.stringify(dataset)).not.toContain('DESIGN_APPROVAL_TERMS');
  });

  it('publishes the authority content verbatim, sentence for sentence', () => {
    for (const agreement of dataset.agreements) {
      expect(agreement.content).toBe(authorityBlock(agreement.agreementType));
    }
  });

  it('carries the sentence counts the authority states', () => {
    const sentences = (content: string): number => content.split('\n\n').length;

    expect(sentences(content('PAYMENT_POLICY'))).toBe(11);
    expect(sentences(content('RETURN_POLICY'))).toBe(12);
  });

  it('is Vietnamese single-language, as DB3 §2.3 locks for the MVP', () => {
    for (const agreement of dataset.agreements) {
      expect(agreement.language).toBe('vi');
    }
  });

  it('states no refund amount the repository has not locked', () => {
    // `ADR-DB3-002` is accepted with deferred parameters: the per-stage refund
    // **amounts** are `CON-144` configuration nobody has signed off (`IMP-O008`,
    // owner APP9). §5.6.2 publishes the dispositions and never a number, so the
    // only digits legitimately in the return policy are its sentence labels.
    const returnPolicy = content('RETURN_POLICY');
    const withoutLabels = returnPolicy.replace(/^R\d+\./gm, '');

    expect(withoutLabels).not.toMatch(/\d+\s*%/);
    expect(withoutLabels).not.toMatch(/\d[\d.,]*\s*(VND|đ)/i);
  });

  function content(agreementType: string): string {
    const agreement = dataset.agreements.find((entry) => entry.agreementType === agreementType);
    if (agreement === undefined) throw new Error(`${agreementType} is missing from the dataset.`);
    return agreement.content;
  }
});
