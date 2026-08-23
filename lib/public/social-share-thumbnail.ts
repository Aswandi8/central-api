import sharp, { type OverlayOptions } from "sharp";

// ============================================================
// CONSTANTS
// ============================================================

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 630;

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
// SEVEN SEGMENT
// ============================================================

type Segment = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const DIGIT_SEGMENTS: Record<string, Segment[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],

  "1": ["b", "c"],

  "2": ["a", "b", "g", "e", "d"],

  "3": ["a", "b", "c", "d", "g"],

  "4": ["f", "g", "b", "c"],

  "5": ["a", "f", "g", "c", "d"],

  "6": ["a", "f", "g", "e", "c", "d"],

  "7": ["a", "b", "c"],

  "8": ["a", "b", "c", "d", "e", "f", "g"],

  "9": ["a", "b", "c", "d", "f", "g"],
};

// ============================================================
// DIGIT SVG
// ============================================================

function createDigitSvg(
  digit: string,
  x: number,
  y: number,
  scale = 1,
): string {
  const segments = DIGIT_SEGMENTS[digit];

  if (!segments) {
    return "";
  }

  const width = 18 * scale;

  const height = 4 * scale;

  const verticalWidth = 4 * scale;

  const verticalHeight = 18 * scale;

  const middleY = y + 21 * scale;

  const bottomY = y + 42 * scale;

  const rightX = x + 18 * scale;

  const has = (segment: Segment) => segments.includes(segment);

  return `
    ${
      has("a")
        ? `
          <rect
            x="${x}"
            y="${y}"
            width="${width}"
            height="${height}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }

    ${
      has("b")
        ? `
          <rect
            x="${rightX}"
            y="${y + 3 * scale}"
            width="${verticalWidth}"
            height="${verticalHeight}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }

    ${
      has("c")
        ? `
          <rect
            x="${rightX}"
            y="${middleY + 3 * scale}"
            width="${verticalWidth}"
            height="${verticalHeight}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }

    ${
      has("d")
        ? `
          <rect
            x="${x}"
            y="${bottomY}"
            width="${width}"
            height="${height}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }

    ${
      has("e")
        ? `
          <rect
            x="${x - 4 * scale}"
            y="${middleY + 3 * scale}"
            width="${verticalWidth}"
            height="${verticalHeight}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }

    ${
      has("f")
        ? `
          <rect
            x="${x - 4 * scale}"
            y="${y + 3 * scale}"
            width="${verticalWidth}"
            height="${verticalHeight}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }

    ${
      has("g")
        ? `
          <rect
            x="${x}"
            y="${middleY}"
            width="${width}"
            height="${height}"
            rx="${2 * scale}"
            fill="white"
          />
        `
        : ""
    }
  `;
}

// ============================================================
// COLON SVG
// ============================================================

function createColonSvg(x: number, y: number, scale = 1): string {
  return `
    <circle
      cx="${x}"
      cy="${y + 15 * scale}"
      r="${2.8 * scale}"
      fill="white"
    />

    <circle
      cx="${x}"
      cy="${y + 32 * scale}"
      r="${2.8 * scale}"
      fill="white"
    />
  `;
}

// ============================================================
// DURATION DRAWING
// ============================================================

function createDurationDigits(displayDuration: string): string {
  const normalized = displayDuration.trim().replace(/[^0-9:]/g, "");

  if (!normalized) {
    return "";
  }

  const scale = 0.65;

  const digitAdvance = 21;

  const colonAdvance = 10;

  let cursorX = 0;

  const parts: string[] = [];

  for (const character of normalized) {
    if (character === ":") {
      parts.push(createColonSvg(cursorX + 2, 0, scale));

      cursorX += colonAdvance;

      continue;
    }

    if (DIGIT_SEGMENTS[character]) {
      parts.push(createDigitSvg(character, cursorX, 0, scale));

      cursorX += digitAdvance;
    }
  }

  /*
   * Return width + SVG content
   * encoded through a group wrapper.
   */
  return `
    <g
      transform="translate(${0}, 0)"
    >
      ${parts.join("")}
    </g>
  `;
}

// ============================================================
// DURATION OVERLAY
// ============================================================

function createDurationOverlay(displayDuration: string): Buffer {
  const normalized = displayDuration.trim().replace(/[^0-9:]/g, "");

  /*
   * MM:SS = 5 chars
   * HH:MM:SS = 8 chars
   */
  const isLong = normalized.length > 5;

  const boxWidth = isLong ? 205 : 145;

  const boxHeight = 52;

  const boxX = OUTPUT_WIDTH - boxWidth - 36;

  const boxY = OUTPUT_HEIGHT - boxHeight - 28;

  const digitSvg = createDurationDigits(normalized);

  /*
   * Seven-segment output has no dependency
   * on fonts installed on Vercel.
   */
  const contentWidth = isLong ? 143 : 91;

  const offsetX = boxX + (boxWidth - contentWidth) / 2;

  const offsetY = boxY + 9;

  const svg = `
    <svg
      width="${OUTPUT_WIDTH}"
      height="${OUTPUT_HEIGHT}"
      viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="${boxX}"
        y="${boxY}"
        width="${boxWidth}"
        height="${boxHeight}"
        rx="8"
        fill="rgba(0,0,0,0.80)"
      />

      <g
        transform="
          translate(
            ${offsetX},
            ${offsetY}
          )
        "
      >
        ${digitSvg}
      </g>
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

  if (displayDuration?.trim()) {
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
