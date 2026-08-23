import sharp, { type OverlayOptions } from "sharp";

// ============================================================
// CONSTANTS
// ============================================================

const OUTPUT_WIDTH = 1200;

const OUTPUT_HEIGHT = 630;

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// ============================================================
// DOWNLOAD IMAGE
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

  if (!contentType?.startsWith("image/")) {
    throw new Error("Thumbnail URL did not return an image");
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ============================================================
// PLAY OVERLAY
// ============================================================

function createPlayOverlay(): Buffer {
  const centerX = OUTPUT_WIDTH / 2;

  const centerY = OUTPUT_HEIGHT / 2;

  const svg = `
    <svg
      width="${OUTPUT_WIDTH}"
      height="${OUTPUT_HEIGHT}"
      viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="${centerX}"
        cy="${centerY}"
        r="78"
        fill="rgba(0,0,0,0.70)"
      />

      <polygon
        points="
          ${centerX - 22},${centerY - 40}
          ${centerX - 22},${centerY + 40}
          ${centerX + 48},${centerY}
        "
        fill="white"
      />
    </svg>
  `;

  return Buffer.from(svg);
}

// ============================================================
// DURATION OVERLAY
// ============================================================

function createDurationOverlay(displayDuration: string): Buffer {
  const duration = escapeXml(displayDuration);

  const svg = `
    <svg
      width="${OUTPUT_WIDTH}"
      height="${OUTPUT_HEIGHT}"
      viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="${OUTPUT_WIDTH - 185}"
        y="${OUTPUT_HEIGHT - 78}"
        width="145"
        height="48"
        rx="8"
        fill="rgba(0,0,0,0.78)"
      />

      <text
        x="${OUTPUT_WIDTH - 112.5}"
        y="${OUTPUT_HEIGHT - 45}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="26"
        font-weight="700"
        fill="white"
      >
        ${duration}
      </text>
    </svg>
  `;

  return Buffer.from(svg);
}

// ============================================================
// GENERATE
// ============================================================

export async function generateSocialShareThumbnail({
  thumbnailUrl,
  displayDuration,
}: {
  thumbnailUrl: string;

  displayDuration: string | null;
}): Promise<Buffer> {
  const source = await downloadImage(thumbnailUrl);

  const composites: OverlayOptions[] = [
    {
      input: createPlayOverlay(),
    },
  ];

  if (displayDuration) {
    composites.push({
      input: createDurationOverlay(displayDuration),
    });
  }

  return sharp(source)
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
      fit: "cover",

      position: "centre",
    })
    .composite(composites)
    .png({
      compressionLevel: 9,
    })
    .toBuffer();
}
