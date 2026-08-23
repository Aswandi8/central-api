import fs from "node:fs";
import path from "node:path";

import { parse, type Font } from "opentype.js";

import sharp from "sharp";

// ============================================================
// CONSTANTS
// ============================================================

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 630;

const PLAY_RADIUS = 60;

const DURATION_RIGHT = 32;
const DURATION_BOTTOM = 28;

const DURATION_HEIGHT = 50;
const DURATION_PADDING_X = 16;

const DURATION_FONT_SIZE = 26;

// ============================================================
// FONT CACHE
// ============================================================

let cachedFont: Font | null = null;

// ============================================================
// FONT
// ============================================================

function getDurationFont(): Font {
  if (cachedFont) {
    return cachedFont;
  }

  const fontPath = path.join(
    process.cwd(),
    "assets",
    "fonts",
    "Inter-Bold.ttf",
  );

  if (!fs.existsSync(fontPath)) {
    throw new Error(`Social share font not found: ${fontPath}`);
  }

  const buffer = fs.readFileSync(fontPath);

  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  cachedFont = parse(arrayBuffer);

  return cachedFont;
}

// ============================================================
// DURATION
// ============================================================

function normalizeDuration(value: string | null | undefined): string {
  const normalized = value?.trim().replace(/[^0-9:]/g, "");

  return normalized || "00:00";
}

// ============================================================
// DOWNLOAD THUMBNAIL
// ============================================================

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    method: "GET",

    headers: {
      Accept: "image/*",
    },

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to download thumbnail (${response.status})`);
  }

  const contentType = response.headers.get("content-type");

  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error(
      `Thumbnail URL returned invalid content type: ${contentType}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ============================================================
// GLYPH METRICS
// ============================================================

function getGlyphAdvance(
  font: Font,
  character: string,
  fontSize: number,
): number {
  const glyph = font.charToGlyph(character);

  const advanceWidth = glyph.advanceWidth ?? font.unitsPerEm;

  return (advanceWidth / font.unitsPerEm) * fontSize;
}

// ============================================================
// TEXT WIDTH
// ============================================================

function measureDuration(font: Font, duration: string): number {
  let width = 0;

  for (const character of duration) {
    width += getGlyphAdvance(font, character, DURATION_FONT_SIZE);
  }

  return width;
}

// ============================================================
// DURATION PATH
// ============================================================

function createDurationPath(duration: string) {
  const font = getDurationFont();

  /*
   * IMPORTANT:
   *
   * Jangan gunakan:
   *
   * font.getPath(duration, ...)
   * font.getAdvanceWidth(duration, ...)
   *
   * karena keduanya dapat masuk ke GSUB shaping engine
   * opentype.js.
   *
   * Inter memiliki lookup GSUB yang belum sepenuhnya
   * didukung opentype.js.
   *
   * Untuk duration kita hanya membutuhkan:
   *
   * 0-9 dan :
   *
   * jadi glyph dirender satu per satu.
   */
  const textWidth = measureDuration(font, duration);

  const badgeWidth = Math.max(
    90,
    Math.ceil(textWidth + DURATION_PADDING_X * 2),
  );

  const badgeX = OUTPUT_WIDTH - DURATION_RIGHT - badgeWidth;

  const badgeY = OUTPUT_HEIGHT - DURATION_BOTTOM - DURATION_HEIGHT;

  let cursorX = badgeX + (badgeWidth - textWidth) / 2;

  /*
   * opentype glyph path memakai baseline.
   */
  const baseline = badgeY + 34;

  const paths: string[] = [];

  for (const character of duration) {
    const glyph = font.charToGlyph(character);

    const glyphPath = glyph.getPath(cursorX, baseline, DURATION_FONT_SIZE);

    paths.push(glyphPath.toPathData(2));

    cursorX += getGlyphAdvance(font, character, DURATION_FONT_SIZE);
  }

  return {
    badgeWidth,
    badgeX,
    badgeY,

    pathData: paths.join(" "),
  };
}

// ============================================================
// OVERLAY SVG
// ============================================================

function createOverlaySvg(displayDuration: string): Buffer {
  const duration = normalizeDuration(displayDuration);

  const { badgeWidth, badgeX, badgeY, pathData } = createDurationPath(duration);

  // ==========================================================
  // PLAY
  // ==========================================================

  const centerX = OUTPUT_WIDTH / 2;

  const centerY = OUTPUT_HEIGHT / 2;

  const triangleCenterX = centerX + 5;

  const triangleLeft = triangleCenterX - 19;

  const triangleRight = triangleCenterX + 25;

  const triangleTop = centerY - 27;

  const triangleBottom = centerY + 27;

  // ==========================================================
  // SVG
  // ==========================================================

  const svg = `
    <svg
      width="${OUTPUT_WIDTH}"
      height="${OUTPUT_HEIGHT}"
      viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Play shadow -->

      <circle
        cx="${centerX}"
        cy="${centerY + 3}"
        r="${PLAY_RADIUS + 2}"
        fill="rgba(0,0,0,0.22)"
      />

      <!-- Play background -->

      <circle
        cx="${centerX}"
        cy="${centerY}"
        r="${PLAY_RADIUS}"
        fill="rgba(0,0,0,0.72)"
      />

      <!-- Play triangle -->

      <polygon
        points="
          ${triangleLeft},${triangleTop}
          ${triangleRight},${centerY}
          ${triangleLeft},${triangleBottom}
        "
        fill="#ffffff"
      />

      <!-- Duration badge -->

      <rect
        x="${badgeX}"
        y="${badgeY}"
        width="${badgeWidth}"
        height="${DURATION_HEIGHT}"
        rx="7"
        ry="7"
        fill="rgba(0,0,0,0.82)"
      />

      <!--
        Inter glyphs converted to vector paths.

        Sharp / librsvg tidak perlu merender font.
        opentype.js juga tidak menjalankan GSUB shaping
        karena glyph kita ambil satu per satu.
      -->

      <path
        d="${pathData}"
        fill="#ffffff"
      />
    </svg>
  `;

  return Buffer.from(svg);
}

// ============================================================
// GENERATOR
// ============================================================

export async function generateSocialShareThumbnail({
  thumbnailUrl,
  displayDuration,
}: {
  thumbnailUrl: string;

  displayDuration: string | null;
}): Promise<Buffer> {
  const source = await downloadImage(thumbnailUrl);

  const duration = normalizeDuration(displayDuration);

  const overlay = createOverlaySvg(duration);

  return sharp(source)
    .rotate()

    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
      fit: "cover",

      position: "centre",
    })

    .composite([
      {
        input: overlay,

        top: 0,
        left: 0,
      },
    ])

    .png({
      compressionLevel: 9,
    })

    .toBuffer();
}
