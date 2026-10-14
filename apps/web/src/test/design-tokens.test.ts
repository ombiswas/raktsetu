import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_TOKEN_HEXES = new Set([
  '#0a0a0a', // canvas, on-primary
  '#1a1c20', // canvas-soft
  '#191919', // canvas-card
  '#363a3f', // canvas-mid
  '#212327', // hairline
  '#ffffff', // primary, ink
  '#fafaf7', // ink-hover
  '#dadbdf', // body
  '#7d8187', // body-mid, mute
  '#ff7a17', // accent-sunset (urgent)
  '#ffc285', // accent-sunset-soft
  '#7c3aed', // accent-dusk
  '#c4b5fd', // accent-twilight
  '#a0c3ec', // accent-breeze (informational)
  '#0d1726'  // accent-midnight
]);

describe('Design Tokens Hex Color Validation', () => {
  it('ensures index.css uses strictly declared design token hex values with zero stray colors', () => {
    const cssPath = path.resolve(__dirname, '../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Extract all hex colors (e.g. #0a0a0a, #ffffff, #fff)
    const hexRegex = /#([0-9a-fA-F]{3,8})\b/g;
    const matches = cssContent.match(hexRegex) || [];

    const normalizedHexes = matches.map((h) => {
      let hex = h.toLowerCase();
      // Expand 3-character hex e.g. #fff -> #ffffff
      if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      }
      return hex;
    });

    const strayColors: string[] = [];
    for (const hex of normalizedHexes) {
      if (!ALLOWED_TOKEN_HEXES.has(hex)) {
        strayColors.push(hex);
      }
    }

    expect(
      strayColors,
      `Found undeclared / stray colors in index.css: ${strayColors.join(', ')}`
    ).toHaveLength(0);
  });
});
