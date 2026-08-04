/**
 * The controlled font registry (IMP-D044 PO-10, assets from `APP3-F01`).
 *
 * A document stores a `fontId` and nothing else — never a CSS family, a URL or
 * font bytes — so this table is the only thing that turns that id into a real
 * face. Everything it names was acquired, licensed, hashed and coverage-checked
 * by `APP3-F01`; nothing may be added here that was not.
 *
 * ## Why the metadata is transcribed rather than imported
 *
 * The hashes and paths below are copied from
 * `packages/design-document/assets/fonts/inter/4.1/FONT-PROVENANCE.json`. They
 * are not read at runtime: the package must stay browser-safe and must not
 * touch a filesystem, and the build only emits `src/`, so importing a JSON file
 * from `assets/` would either break the build or drag Node APIs into a browser
 * bundle. Transcription is safe here **because a test proves it**:
 * `registry.spec.ts` reads the committed manifests and fails if a single
 * character has drifted, so the copy can never quietly disagree with the
 * evidence it claims to describe.
 *
 * ## Fallback
 *
 * `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`. There is no silent substitution,
 * because a substituted face has different metrics — the design would be
 * stitched at a size and shape the customer never approved, and nothing on
 * screen would say so.
 */
import type { FontStyle } from '../schema/elements';

export const DESIGN_FONT_REGISTRY_VERSION = 1;

export type FontFallbackPolicy = 'REJECT_IF_CONTROLLED_FONT_UNAVAILABLE';

/** A controlled binary: where it lives, what it weighs, and what proves it. */
export interface ControlledFontFile {
  readonly style: FontStyle;
  /** Repository-relative path. Never a URL, and never resolved at runtime. */
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
}

export interface ControlledFont {
  readonly fontId: string;
  readonly family: string;
  readonly styles: readonly FontStyle[];
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly files: readonly ControlledFontFile[];
  readonly licenseSpdx: string;
  /** The committed licence file, so the licence travels with the asset. */
  readonly licensePath: string;
  readonly upstreamTag: string;
  readonly upstreamCommit: string;
  readonly vietnameseCoverage: 'VERIFIED_COMPLETE';
  readonly coverageEvidencePath: string;
  readonly provenanceEvidencePath: string;
  readonly fallbackPolicy: FontFallbackPolicy;
}

const ASSET_DIR = 'packages/design-document/assets/fonts/inter/4.1';

export const INTER_CONTROLLED_FONT: ControlledFont = Object.freeze({
  fontId: 'inter',
  family: 'Inter',
  styles: Object.freeze(['normal', 'italic'] as const),
  minWeight: 100,
  maxWeight: 900,
  files: Object.freeze([
    Object.freeze({
      style: 'normal' as const,
      path: `${ASSET_DIR}/InterVariable.woff2`,
      sha256: '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3',
      byteSize: 352_240,
    }),
    Object.freeze({
      style: 'italic' as const,
      path: `${ASSET_DIR}/InterVariable-Italic.woff2`,
      sha256: 'e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a',
      byteSize: 387_976,
    }),
  ]),
  licenseSpdx: 'OFL-1.1',
  licensePath: `${ASSET_DIR}/LICENSE.txt`,
  upstreamTag: 'v4.1',
  upstreamCommit: 'e3a3d4c57d5ecc01453a575621882a384c1995a3',
  vietnameseCoverage: 'VERIFIED_COMPLETE',
  coverageEvidencePath: `${ASSET_DIR}/VIETNAMESE-COVERAGE.json`,
  provenanceEvidencePath: `${ASSET_DIR}/FONT-PROVENANCE.json`,
  fallbackPolicy: 'REJECT_IF_CONTROLLED_FONT_UNAVAILABLE',
});

/**
 * Every font a document may reference. One entry today.
 *
 * General Sans is **not** here and must not be added: it is a CSS fallback in
 * `packages/styles` for interface chrome, with no committed binary, no licence
 * artifact and no coverage evidence in this repository.
 */
export const DESIGN_FONT_REGISTRY: readonly ControlledFont[] = Object.freeze([
  INTER_CONTROLLED_FONT,
]);

const BY_ID = new Map(DESIGN_FONT_REGISTRY.map((font) => [font.fontId, font]));

export function findControlledFont(fontId: string): ControlledFont | undefined {
  return BY_ID.get(fontId);
}

/** True when the family supports this style at this weight. */
export function supportsVariant(font: ControlledFont, style: FontStyle, weight: number): boolean {
  if (!font.styles.includes(style)) return false;
  if (!Number.isInteger(weight)) return false;
  return weight >= font.minWeight && weight <= font.maxWeight;
}
