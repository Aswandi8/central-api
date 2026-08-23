import fs from "node:fs";
import path from "node:path";

import { parse, type Font } from "opentype.js";

import sharp from "sharp";

import { assertSafeRemoteMediaUrl } from "@/lib/security/remote-media-url";

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

const MAX_REDIRECTS = 5;

/*
 * Source thumbnail limit.
 *
 * Social thumbnail tidak perlu menerima image puluhan/ratusan MB.
 */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 10_000;

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
// CONTENT LENGTH
// ============================================================

function validateContentLength(response: Response): void {
  const raw = response.headers.get("content-length");

  if (!raw) {
    return;
  }

  const length = Number(raw);

  if (Number.isFinite(length) && length > MAX_SOURCE_BYTES) {
    throw new Error("Thumbnail source is too large");
  }
}

// ============================================================
// READ BODY WITH LIMIT
// ============================================================

async function readImageBody(response: Response): Promise<Buffer> {
  /*
   * Some CDNs don't send Content-Length,
   * so we must enforce the size limit while reading.
   */
  if (!response.body) {
    throw new Error("Thumbnail response has no body");
  }

  const reader = response.body.getReader();

  const chunks: Uint8Array[] = [];

  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      total += value.byteLength;

      if (total > MAX_SOURCE_BYTES) {
        throw new Error("Thumbnail source is too large");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
}

// ============================================================
// DOWNLOAD THUMBNAIL
// ============================================================

async function downloadImage(initialUrl: string): Promise<Buffer> {
  let currentUrl = initialUrl;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    /*
     * Validate every URL, including redirect targets.
     */
    const safeUrl = await assertSafeRemoteMediaUrl(currentUrl);

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(safeUrl, {
        method: "GET",

        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        },

        /*
         * Important:
         *
         * We handle redirects ourselves so every
         * destination can be checked against SSRF.
         */
        redirect: "manual",

        cache: "no-store",

        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Thumbnail request timed out");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    // ========================================================
    // REDIRECT
    // ========================================================

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error(
          "Thumbnail server returned a redirect without Location",
        );
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error("Thumbnail URL redirected too many times");
      }

      currentUrl = new URL(location, safeUrl).toString();

      continue;
    }

    // ========================================================
    // HTTP
    // ========================================================

    if (!response.ok) {
      throw new Error(`Unable to download thumbnail (${response.status})`);
    }

    // ========================================================
    // CONTENT TYPE
    // ========================================================

    const contentType = response.headers.get("content-type");

    if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
      throw new Error(
        `Thumbnail URL returned invalid content type: ${
          contentType ?? "missing"
        }`,
      );
    }

    validateContentLength(response);

    return readImageBody(response);
  }

  throw new Error("Unable to resolve thumbnail URL");
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

  const textWidth = measureDuration(font, duration);

  const badgeWidth = Math.max(
    90,
    Math.ceil(textWidth + DURATION_PADDING_X * 2),
  );

  const badgeX = OUTPUT_WIDTH - DURATION_RIGHT - badgeWidth;

  const badgeY = OUTPUT_HEIGHT - DURATION_BOTTOM - DURATION_HEIGHT;

  let cursorX = badgeX + (badgeWidth - textWidth) / 2;

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

  const centerX = OUTPUT_WIDTH / 2;

  const centerY = OUTPUT_HEIGHT / 2;

  const triangleCenterX = centerX + 5;

  const triangleLeft = triangleCenterX - 19;

  const triangleRight = triangleCenterX + 25;

  const triangleTop = centerY - 27;

  const triangleBottom = centerY + 27;

  const svg = `
    <svg
      width="${OUTPUT_WIDTH}"
      height="${OUTPUT_HEIGHT}"
      viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="${centerX}"
        cy="${centerY + 3}"
        r="${PLAY_RADIUS + 2}"
        fill="rgba(0,0,0,0.22)"
      />

      <circle
        cx="${centerX}"
        cy="${centerY}"
        r="${PLAY_RADIUS}"
        fill="rgba(0,0,0,0.72)"
      />

      <polygon
        points="
          ${triangleLeft},${triangleTop}
          ${triangleRight},${centerY}
          ${triangleLeft},${triangleBottom}
        "
        fill="#ffffff"
      />

      <rect
        x="${badgeX}"
        y="${badgeY}"
        width="${badgeWidth}"
        height="${DURATION_HEIGHT}"
        rx="7"
        ry="7"
        fill="rgba(0,0,0,0.82)"
      />

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

  return sharp(source, {
    /*
     * Avoid decompression bombs / gigantic pixel images.
     */
    limitInputPixels: 40_000_000,
  })
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
