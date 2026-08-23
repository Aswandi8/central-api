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

  /*
   * opentype.js membutuhkan ArrayBuffer yang tepat.
   *
   * Buffer Node.js bisa memakai backing ArrayBuffer dengan offset,
   * jadi kita slice sesuai byteOffset dan byteLength.
   */
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
// DURATION PATH
// ============================================================

function createDurationPath(duration: string) {
  const font = getDurationFont();

  /*
   * Hitung lebar teks berdasarkan glyph asli Inter.
   */
  const textWidth = font.getAdvanceWidth(duration, DURATION_FONT_SIZE, {
    kerning: true,
  });

  const badgeWidth = Math.max(
    90,
    Math.ceil(textWidth + DURATION_PADDING_X * 2),
  );

  const badgeX = OUTPUT_WIDTH - DURATION_RIGHT - badgeWidth;

  const badgeY = OUTPUT_HEIGHT - DURATION_BOTTOM - DURATION_HEIGHT;

  /*
   * Horizontal center.
   */
  const textX = badgeX + (badgeWidth - textWidth) / 2;

  /*
   * getPath menggunakan baseline.
   *
   * Nilai ini disesuaikan supaya teks Inter terlihat
   * berada di tengah badge secara visual.
   */
  const textBaseline = badgeY + 34;

  const textPath = font.getPath(
    duration,
    textX,
    textBaseline,
    DURATION_FONT_SIZE,
    {
      kerning: true,
    },
  );

  return {
    badgeWidth,
    badgeX,
    badgeY,

    /*
     * Setelah teks menjadi path,
     * Sharp tidak lagi membutuhkan font.
     */
    pathData: textPath.toPathData(2),
  };
}

// ============================================================
// OVERLAY SVG
// ============================================================

function createOverlaySvg(displayDuration: string): Buffer {
  const duration = normalizeDuration(displayDuration);

  const { badgeWidth, badgeX, badgeY, pathData } = createDurationPath(duration);

  // ==========================================================
  // PLAY BUTTON POSITION
  // ==========================================================

  const centerX = OUTPUT_WIDTH / 2;

  const centerY = OUTPUT_HEIGHT / 2;

  /*
   * Triangle sedikit digeser ke kanan agar secara optik
   * terlihat benar-benar di tengah lingkaran.
   */
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
      <!-- ================================================
           PLAY SHADOW
      ================================================= -->

      <circle
        cx="${centerX}"
        cy="${centerY + 3}"
        r="${PLAY_RADIUS + 2}"
        fill="rgba(0,0,0,0.22)"
      />

      <!-- ================================================
           PLAY BUTTON BACKGROUND
      ================================================= -->

      <circle
        cx="${centerX}"
        cy="${centerY}"
        r="${PLAY_RADIUS}"
        fill="rgba(0,0,0,0.72)"
      />

      <!-- ================================================
           PLAY TRIANGLE
      ================================================= -->

      <polygon
        points="
          ${triangleLeft},${triangleTop}
          ${triangleRight},${centerY}
          ${triangleLeft},${triangleBottom}
        "
        fill="#ffffff"
      />

      <!-- ================================================
           DURATION BADGE
      ================================================= -->

      <rect
        x="${badgeX}"
        y="${badgeY}"
        width="${badgeWidth}"
        height="${DURATION_HEIGHT}"
        rx="7"
        ry="7"
        fill="rgba(0,0,0,0.82)"
      />

      <!-- ================================================
           INTER GLYPHS AS VECTOR PATH
      ================================================= -->

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

  return (
    sharp(source)
      /*
       * Respect EXIF orientation.
       */
      .rotate()

      /*
       * Social preview size.
       */
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
        fit: "cover",

        position: "centre",
      })

      /*
       * Add play button + fake duration.
       */
      .composite([
        {
          input: overlay,

          top: 0,
          left: 0,
        },
      ])

      /*
       * Keep PNG because our public endpoint
       * currently returns Content-Type image/png.
       */
      .png({
        compressionLevel: 9,
      })

      .toBuffer()
  );
}
