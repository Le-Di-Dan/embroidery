#!/usr/bin/env node
/**
 * Generates every spike asset locally and deterministically.
 *
 * No CDN, no third-party or copyrighted image, no customer data. The SVG
 * fixture deliberately contains a `<script>` and an `onload` handler so the
 * probes can prove that the SVG candidate strips them and that no engine ever
 * executes them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'assets');

const SVG_FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <script>window.__svgScriptExecuted = true;</script>
  <rect x="10" y="10" width="80" height="80" rx="12" fill="#1d3557" onload="window.__svgScriptExecuted = true" />
  <circle cx="50" cy="50" r="24" fill="#f1faee" />
  <path d="M 30 62 L 50 30 L 70 62 Z" fill="#e63946" />
</svg>
`;

function checkerboard(width, height, a, b, cell) {
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`];
  svg.push(`<rect width="${width}" height="${height}" fill="${a}"/>`);
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (((x / cell) | 0) % 2 === ((y / cell) | 0) % 2) {
        svg.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${b}"/>`);
      }
    }
  }
  svg.push('</svg>');
  return Buffer.from(svg.join(''));
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  await sharp(checkerboard(900, 900, '#e9ecef', '#dee2e6', 60))
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'product-front.png'));

  await sharp(checkerboard(240, 240, '#a8dadc', '#457b9d', 30))
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'badge.png'));

  await sharp(checkerboard(480, 360, '#ffb703', '#fb8500', 24))
    .jpeg({ quality: 80 })
    .toFile(join(OUT, 'photo.jpg'));

  writeFileSync(join(OUT, 'mark.svg'), SVG_FIXTURE, 'utf8');

  console.log('[spike] assets written to public/assets');
}

await main();
