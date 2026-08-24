import { randomBytes } from "crypto";
import { z } from "zod";

export const SHORTLINK_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const SHORTLINK_PREVIEW_TYPES = ["NONE", "IMAGE", "VIDEO"] as const;

export const SHORTLINK_SORT_FIELDS = [
  "slug",
  "title",
  "status",
  "previewType",
  "clickCount",
  "createdAt",
  "updatedAt",
] as const;

export type ShortLinkStatus = (typeof SHORTLINK_STATUSES)[number];
export type ShortLinkPreviewType = (typeof SHORTLINK_PREVIEW_TYPES)[number];
export type ShortLinkSortField = (typeof SHORTLINK_SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";

const DISPLAY_DURATION_REGEX = /^(?:\d{1,2}:)?[0-5]\d:[0-5]\d$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalText(max: number) {
  return z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (typeof value === "string" ? value || null : value));
}

function optionalPositiveInt() {
  return z.union([z.number().int().positive(), z.null()]).optional();
}

function optionalNonNegativeInt() {
  return z.union([z.number().int().nonnegative(), z.null()]).optional();
}

function optionalHttpUrl() {
  return z
    .union([
      z
        .string()
        .trim()
        .url("Invalid URL")
        .refine(
          (value) =>
            value.startsWith("http://") || value.startsWith("https://"),
          "URL must use http or https",
        ),
      z.null(),
    ])
    .optional();
}

export const shortLinkCreateSchema = z.object({
  slug: z.string().trim().max(100).optional().default(""),

  destinationUrl: z
    .string()
    .trim()
    .url("Invalid destination URL")
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "Destination URL must use http or https",
    ),

  status: z.enum(SHORTLINK_STATUSES).optional().default("ACTIVE"),
  previewType: z.enum(SHORTLINK_PREVIEW_TYPES).optional().default("NONE"),

  title: optionalText(200),
  description: optionalText(1000),

  thumbnailUrl: optionalHttpUrl(),
  thumbnailWidth: optionalPositiveInt(),
  thumbnailHeight: optionalPositiveInt(),
  thumbnailMimeType: optionalText(100),
  thumbnailSizeBytes: optionalNonNegativeInt(),

  previewVideoUrl: optionalHttpUrl(),
  previewVideoWidth: optionalPositiveInt(),
  previewVideoHeight: optionalPositiveInt(),
  previewVideoDurationMs: optionalPositiveInt(),
  previewVideoMimeType: optionalText(100),
  previewVideoSizeBytes: optionalNonNegativeInt(),

  showPlayButton: z.boolean().optional().default(false),

  displayDuration: z
    .union([
      z
        .string()
        .trim()
        .regex(
          DISPLAY_DURATION_REGEX,
          "Display duration must use MM:SS or HH:MM:SS format",
        ),
      z.null(),
    ])
    .optional(),
});

export const shortLinkUpdateSchema = z.object({
  slug: z.string().trim().max(100).optional(),

  destinationUrl: z
    .string()
    .trim()
    .url("Invalid destination URL")
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "Destination URL must use http or https",
    )
    .optional(),

  status: z.enum(SHORTLINK_STATUSES).optional(),
  previewType: z.enum(SHORTLINK_PREVIEW_TYPES).optional(),

  title: optionalText(200),
  description: optionalText(1000),

  thumbnailUrl: optionalHttpUrl(),
  thumbnailWidth: optionalPositiveInt(),
  thumbnailHeight: optionalPositiveInt(),
  thumbnailMimeType: optionalText(100),
  thumbnailSizeBytes: optionalNonNegativeInt(),

  previewVideoUrl: optionalHttpUrl(),
  previewVideoWidth: optionalPositiveInt(),
  previewVideoHeight: optionalPositiveInt(),
  previewVideoDurationMs: optionalPositiveInt(),
  previewVideoMimeType: optionalText(100),
  previewVideoSizeBytes: optionalNonNegativeInt(),

  showPlayButton: z.boolean().optional(),

  displayDuration: z
    .union([
      z
        .string()
        .trim()
        .regex(
          DISPLAY_DURATION_REGEX,
          "Display duration must use MM:SS or HH:MM:SS format",
        ),
      z.null(),
    ])
    .optional(),
});

export interface ShortLinkState {
  destinationUrl: string;
  status: ShortLinkStatus;
  previewType: ShortLinkPreviewType;

  title: string | null;
  description: string | null;

  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  thumbnailMimeType: string | null;
  thumbnailSizeBytes: number | null;

  previewVideoUrl: string | null;
  previewVideoWidth: number | null;
  previewVideoHeight: number | null;
  previewVideoDurationMs: number | null;
  previewVideoMimeType: string | null;
  previewVideoSizeBytes: number | null;

  showPlayButton: boolean;
  displayDuration: string | null;
}

export function normalizeShortLinkSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidShortLinkSlug(value: string): boolean {
  return value.length > 0 && value.length <= 100 && SLUG_REGEX.test(value);
}

export function createRandomShortLinkSlug(): string {
  return randomBytes(6).toString("base64url").toLowerCase();
}

export function validateShortLinkState(state: ShortLinkState): string | null {
  if (state.previewType === "NONE") {
    return null;
  }

  if (state.previewType === "IMAGE") {
    if (!state.thumbnailUrl) {
      return "Thumbnail URL is required for IMAGE preview";
    }

    return null;
  }

  if (!state.thumbnailUrl) {
    return "Thumbnail URL is required as VIDEO poster/fallback";
  }

  if (!state.previewVideoUrl) {
    return "Preview video URL is required for VIDEO preview";
  }

  return null;
}

export function normalizeShortLinkMedia(state: ShortLinkState): ShortLinkState {
  if (state.previewType === "NONE") {
    return {
      ...state,
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
      thumbnailMimeType: null,
      thumbnailSizeBytes: null,
      previewVideoUrl: null,
      previewVideoWidth: null,
      previewVideoHeight: null,
      previewVideoDurationMs: null,
      previewVideoMimeType: null,
      previewVideoSizeBytes: null,
      showPlayButton: false,
      displayDuration: null,
    };
  }

  if (state.previewType === "IMAGE") {
    return {
      ...state,
      previewVideoUrl: null,
      previewVideoWidth: null,
      previewVideoHeight: null,
      previewVideoDurationMs: null,
      previewVideoMimeType: null,
      previewVideoSizeBytes: null,
    };
  }

  return state;
}

export function isShortLinkSortField(
  value: string,
): value is ShortLinkSortField {
  return SHORTLINK_SORT_FIELDS.includes(value as ShortLinkSortField);
}
