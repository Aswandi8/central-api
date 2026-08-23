import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 630;

const PLAY_BUTTON_SIZE = 120;
const PLAY_TRIANGLE_WIDTH = 42;
const PLAY_TRIANGLE_HEIGHT = 52;

const DURATION_RIGHT = 32;
const DURATION_BOTTOM = 28;
const DURATION_HEIGHT = 50;
const DURATION_HORIZONTAL_PADDING = 16;
const DURATION_FONT_SIZE = 26;

let cachedFontBase64: string | null = null;

function getFontBase64(): string {
  if (cachedFontBase64) {
    return cachedFontBase64;
  }

  const fontPath = path.join(
    process.cwd(),
    "assets",
    "fonts",
    "Inter-Bold.ttf",
  );

  if (!fs.existsSync(fontPath)) {
    throw new Error(`Social share thumbnail font not found: ${fontPath}`);
  }

  cachedFontBase64 = fs.readFileSync(fontPath).toString("base64");

  return cachedFontBase64;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeDuration(value: string | null | undefined): string {
  const duration = value?.trim();

  if (!duration) {
    return "00:00";
  }

  return duration;
}

function estimateDurationWidth(duration: string): number {
  /*
   * Inter Bold angka cukup konsisten untuk kebutuhan badge duration.
   * Kita tetap memberi horizontal padding agar:
   *
   * 04:33
   * 01:04:33
   *
   * sama-sama muat tanpa terpotong.
   */
  const estimatedTextWidth = duration.length * DURATION_FONT_SIZE * 0.62;

  return Math.max(
    82,
    Math.ceil(estimatedTextWidth + DURATION_HORIZONTAL_PADDING * 2),
  );
}

function createOverlaySvg(duration: string): Buffer {
  const safeDuration = escapeXml(duration);
  const fontBase64 = getFontBase64();

  const centerX = OUTPUT_WIDTH / 2;
  const centerY = OUTPUT_HEIGHT / 2;

  const playCircleX = centerX;
  const playCircleY = centerY;
  const playCircleRadius = PLAY_BUTTON_SIZE / 2;

  /*
   * Triangle sedikit digeser ke kanan agar secara visual
   * terlihat benar-benar berada di tengah lingkaran.
   */
  const triangleCenterX = centerX + 5;
  const triangleCenterY = centerY;

  const triangleLeft = triangleCenterX - PLAY_TRIANGLE_WIDTH / 2;

  const triangleTop = triangleCenterY - PLAY_TRIANGLE_HEIGHT / 2;

  const triangleBottom = triangleCenterY + PLAY_TRIANGLE_HEIGHT / 2;

  const triangleRight = triangleCenterX + PLAY_TRIANGLE_WIDTH / 2;

  const durationWidth = estimateDurationWidth(duration);

  const durationX = OUTPUT_WIDTH - DURATION_RIGHT - durationWidth;

  const durationY = OUTPUT_HEIGHT - DURATION_BOTTOM - DURATION_HEIGHT;

  const durationTextX = durationX + durationWidth / 2;

  /*
   * Baseline dibuat sedikit di bawah center geometris
   * supaya teks Inter terlihat center secara visual.
   */
  const durationTextY =
    durationY + DURATION_HEIGHT / 2 + DURATION_FONT_SIZE * 0.35;

  const svg = `
    <svg
      width="${OUTPUT_WIDTH}"
      height="${OUTPUT_HEIGHT}"
      viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>
          @font-face {
            font-family: "SocialShareInter";
            src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
            font-style: normal;
            font-weight: 700;
          }

          .duration-text {
            font-family: "SocialShareInter", sans-serif;
            font-size: ${DURATION_FONT_SIZE}px;
            font-style: normal;
            font-weight: 700;
          }
        </style>
      </defs>

      <!-- Play button shadow -->
      <circle
        cx="${playCircleX}"
        cy="${playCircleY + 3}"
        r="${playCircleRadius + 2}"
        fill="rgba(0, 0, 0, 0.22)"
      />

      <!-- Play button -->
      <circle
        cx="${playCircleX}"
        cy="${playCircleY}"
        r="${playCircleRadius}"
        fill="rgba(0, 0, 0, 0.72)"
      />

      <!-- Play icon -->
      <polygon
        points="
          ${triangleLeft},${triangleTop}
          ${triangleRight},${triangleCenterY}
          ${triangleLeft},${triangleBottom}
        "
        fill="#ffffff"
      />

      <!-- Duration badge -->
      <rect
        x="${durationX}"
        y="${durationY}"
        width="${durationWidth}"
        height="${DURATION_HEIGHT}"
        rx="7"
        ry="7"
        fill="rgba(0, 0, 0, 0.82)"
      />

      <!-- Duration text -->
      <text
        x="${durationTextX}"
        y="${durationTextY}"
        text-anchor="middle"
        class="duration-text"
        fill="#ffffff"
      >${safeDuration}</text>
    </svg>
  `;

  return Buffer.from(svg);
}

export async function generateSocialShareThumbnail({
  thumbnailUrl,
  displayDuration,
}: {
  thumbnailUrl: string;
  displayDuration?: string | null;
}): Promise<Buffer> {
  const duration = normalizeDuration(displayDuration);

  let thumbnailResponse: Response;

  try {
    thumbnailResponse = await fetch(thumbnailUrl, {
      cache: "no-store",
    });
  } catch (error) {
    console.error("[SOCIAL SHARE THUMBNAIL FETCH]", error);

    throw new Error("Unable to fetch social share thumbnail.");
  }

  if (!thumbnailResponse.ok) {
    throw new Error(
      `Unable to fetch social share thumbnail (${thumbnailResponse.status}).`,
    );
  }

  const contentType = thumbnailResponse.headers.get("content-type");

  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error(
      `Invalid social share thumbnail content type: ${contentType}`,
    );
  }

  const arrayBuffer = await thumbnailResponse.arrayBuffer();

  const thumbnailBuffer = Buffer.from(arrayBuffer);

  const overlay = createOverlaySvg(duration);

  return sharp(thumbnailBuffer)
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
    .jpeg({
      quality: 90,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
}
