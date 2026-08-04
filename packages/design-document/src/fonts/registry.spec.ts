/**
 * The registry against the `APP3-F01` evidence it claims to describe.
 *
 * The registry transcribes hashes and paths because the package must stay
 * browser-safe and cannot read files at runtime. That transcription is only
 * trustworthy if something proves it, so this suite reads the committed
 * manifests and the committed binaries and fails on a single character of
 * drift. It is the reason the constants in `registry.ts` are allowed to be
 * literals at all.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  DESIGN_FONT_REGISTRY,
  DESIGN_FONT_REGISTRY_VERSION,
  INTER_CONTROLLED_FONT,
  findControlledFont,
  supportsVariant,
} from './registry';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => readFileSync(join(REPO_ROOT, relative));
const readJson = (relative: string): Record<string, unknown> =>
  JSON.parse(read(relative).toString('utf8')) as Record<string, unknown>;

interface ProvenanceFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly style: string;
}

describe('the registry names exactly the APP3-F01 assets', () => {
  it('is version 1 with one controlled family', () => {
    expect(DESIGN_FONT_REGISTRY_VERSION).toBe(1);
    expect(DESIGN_FONT_REGISTRY).toHaveLength(1);
    expect(DESIGN_FONT_REGISTRY[0]).toBe(INTER_CONTROLLED_FONT);
  });

  it('carries the locked identity, licence and weight range', () => {
    expect(INTER_CONTROLLED_FONT).toMatchObject({
      fontId: 'inter',
      family: 'Inter',
      styles: ['normal', 'italic'],
      minWeight: 100,
      maxWeight: 900,
      licenseSpdx: 'OFL-1.1',
      upstreamTag: 'v4.1',
      upstreamCommit: 'e3a3d4c57d5ecc01453a575621882a384c1995a3',
      vietnameseCoverage: 'VERIFIED_COMPLETE',
      fallbackPolicy: 'REJECT_IF_CONTROLLED_FONT_UNAVAILABLE',
    });
  });

  it('matches the committed provenance manifest field for field', () => {
    const provenance = readJson(INTER_CONTROLLED_FONT.provenanceEvidencePath);
    expect(provenance.family).toBe(INTER_CONTROLLED_FONT.family);
    expect(provenance.upstreamTag).toBe(INTER_CONTROLLED_FONT.upstreamTag);
    expect(provenance.upstreamCommit).toBe(INTER_CONTROLLED_FONT.upstreamCommit);
    expect(provenance.licenseSpdx).toBe(INTER_CONTROLLED_FONT.licenseSpdx);

    const recorded = provenance.files as readonly ProvenanceFile[];
    expect(recorded).toHaveLength(INTER_CONTROLLED_FONT.files.length);
    for (const file of INTER_CONTROLLED_FONT.files) {
      const entry = recorded.find((candidate) => file.path.endsWith(candidate.path));
      expect(entry).toBeDefined();
      expect(entry?.sha256).toBe(file.sha256);
      expect(entry?.byteSize).toBe(file.byteSize);
      expect(entry?.style).toBe(file.style);
    }
  });

  it('matches the bytes actually committed, not just the manifest', () => {
    // A manifest and a registry can agree with each other and both be wrong
    // about the file on disk, so the binaries are hashed here directly.
    for (const file of INTER_CONTROLLED_FONT.files) {
      const bytes = read(file.path);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      expect(statSync(join(REPO_ROOT, file.path)).size).toBe(file.byteSize);
    }
  });

  it('points at a licence file that exists and is the OFL', () => {
    const licence = read(INTER_CONTROLLED_FONT.licensePath).toString('utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE');
    expect(licence).toContain('Inter');
  });

  it('points at coverage evidence reporting complete Vietnamese support', () => {
    const coverage = readJson(INTER_CONTROLLED_FONT.coverageEvidencePath);
    const files = coverage.files as readonly { missingCodePoints: string[] }[];
    expect(files).toHaveLength(2);
    for (const entry of files) expect(entry.missingCodePoints).toEqual([]);
    expect(coverage.requiredCodePointCount).toBe(156);
  });

  it('distinguishes the upright and italic files', () => {
    const styles = INTER_CONTROLLED_FONT.files.map((file) => file.style);
    expect(styles).toEqual(['normal', 'italic']);
    expect(new Set(styles).size).toBe(styles.length);
  });
});

describe('what the registry refuses to contain', () => {
  it('does not control General Sans', () => {
    expect(findControlledFont('general-sans')).toBeUndefined();
    expect(JSON.stringify(DESIGN_FONT_REGISTRY)).not.toContain('General Sans');
  });

  it('holds no remote URL and no font bytes', () => {
    const serialized = JSON.stringify(DESIGN_FONT_REGISTRY);
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('base64');
    expect(serialized.length).toBeLessThan(2_000);
  });

  it('rejects rather than substituting when a controlled font is unavailable', () => {
    expect(INTER_CONTROLLED_FONT.fallbackPolicy).toBe('REJECT_IF_CONTROLLED_FONT_UNAVAILABLE');
  });
});

describe('variant lookup', () => {
  it('accepts every controlled style at the range boundaries', () => {
    for (const style of ['normal', 'italic'] as const) {
      expect(supportsVariant(INTER_CONTROLLED_FONT, style, 100)).toBe(true);
      expect(supportsVariant(INTER_CONTROLLED_FONT, style, 900)).toBe(true);
    }
  });

  it('rejects a weight one step outside the range', () => {
    expect(supportsVariant(INTER_CONTROLLED_FONT, 'normal', 99)).toBe(false);
    expect(supportsVariant(INTER_CONTROLLED_FONT, 'normal', 901)).toBe(false);
  });

  it('rejects a fractional weight', () => {
    expect(supportsVariant(INTER_CONTROLLED_FONT, 'normal', 400.5)).toBe(false);
  });

  it('finds the family by its document-facing id', () => {
    expect(findControlledFont('inter')).toBe(INTER_CONTROLLED_FONT);
    expect(findControlledFont('Inter')).toBeUndefined();
  });
});
