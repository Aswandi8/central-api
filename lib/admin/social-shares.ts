import { z } from "zod";

// ============================================================
// CONSTANTS
// ============================================================

export const SOCIAL_SHARE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

export const SOCIAL_SHARE_SORT_FIELDS = [
  "title",
  "slug",
  "status",
  "createdAt",
  "updatedAt",
] as const;

// ============================================================
// URL
// ============================================================

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const requiredHttpUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL must not exceed 2048 characters")
  .refine(isHttpUrl, {
    message: "URL must use http or https",
  });

const nullableHttpUrlSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  })
  .refine((value) => value === null || isHttpUrl(value), {
    message: "URL must use http or https",
  });

// ============================================================
// TEXT
// ============================================================

const nullableTextSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  })
  .refine((value) => value === null || value.length <= 10000, {
    message: "Description must not exceed 10000 characters",
  });

// ============================================================
// SLUG
// ============================================================

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(200, "Slug must not exceed 200 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug may only contain lowercase letters, numbers, and hyphens",
  );

// ============================================================
// DISPLAY DURATION
// ============================================================

const displayDurationSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  })
  .refine(
    (value) => {
      if (value === null) {
        return true;
      }

      return /^(?:\d{1,3}:)?[0-5]\d:[0-5]\d$/.test(value);
    },
    {
      message: "Display duration must use MM:SS or HH:MM:SS",
    },
  );

// ============================================================
// CREATE
// ============================================================

export const createSocialShareSchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),

  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must not exceed 200 characters"),

  slug: slugSchema,

  description: nullableTextSchema,

  videoUrl: requiredHttpUrlSchema,

  thumbnail: requiredHttpUrlSchema,

  shareThumbnail: nullableHttpUrlSchema,

  /*
   * Actual duration is stored
   * as total seconds.
   */
  duration: z
    .number()
    .int()
    .min(0, "Duration cannot be negative")
    .nullable()
    .optional(),

  /*
   * Display duration is visual-only.
   *
   * Examples:
   * 12:48
   * 01:12:48
   */
  displayDuration: displayDurationSchema,

  targetUrl: requiredHttpUrlSchema,

  status: z.enum(SOCIAL_SHARE_STATUSES).default("DRAFT"),
});

// ============================================================
// UPDATE
// ============================================================

export const updateSocialShareSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(200, "Title must not exceed 200 characters")
      .optional(),

    slug: slugSchema.optional(),

    description: nullableTextSchema,

    videoUrl: requiredHttpUrlSchema.optional(),

    thumbnail: requiredHttpUrlSchema.optional(),

    shareThumbnail: nullableHttpUrlSchema,

    duration: z
      .number()
      .int()
      .min(0, "Duration cannot be negative")
      .nullable()
      .optional(),

    displayDuration: displayDurationSchema,

    targetUrl: requiredHttpUrlSchema.optional(),

    status: z.enum(SOCIAL_SHARE_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// ============================================================
// LIST QUERY
// ============================================================

/*
 * websiteId is intentionally OPTIONAL.
 *
 * No websiteId:
 * → All accessible websites.
 *
 * websiteId:
 * → One specific website.
 */
export const socialSharesQuerySchema = z.object({
  websiteId: z.string().trim().min(1, "websiteId cannot be empty").optional(),

  q: z.string().trim().max(100).default(""),

  status: z.enum(SOCIAL_SHARE_STATUSES).optional(),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  sort: z.enum(SOCIAL_SHARE_SORT_FIELDS).default("createdAt"),

  order: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================================
// TYPES
// ============================================================

export type CreateSocialShareInput = z.infer<typeof createSocialShareSchema>;

export type UpdateSocialShareInput = z.infer<typeof updateSocialShareSchema>;

export type SocialSharesQuery = z.infer<typeof socialSharesQuerySchema>;

// ============================================================
// SELECT
// ============================================================

export const socialShareSelect = {
  id: true,
  websiteId: true,

  title: true,
  slug: true,
  description: true,

  videoUrl: true,
  thumbnail: true,
  shareThumbnail: true,

  duration: true,
  displayDuration: true,

  targetUrl: true,
  status: true,

  createdAt: true,
  updatedAt: true,

  website: {
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      status: true,
    },
  },
} as const;

// ============================================================
// RECORD TYPE
// ============================================================

interface SocialShareRecord {
  id: string;
  websiteId: string;

  title: string;
  slug: string;

  description: string | null;

  videoUrl: string;

  thumbnail: string;

  shareThumbnail: string | null;

  duration: number | null;

  displayDuration: string | null;

  targetUrl: string;

  status: "DRAFT" | "ACTIVE" | "ARCHIVED";

  createdAt: Date;
  updatedAt: Date;

  website: {
    id: string;
    name: string;
    slug: string;

    domain: string | null;

    status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
  };
}

// ============================================================
// PUBLIC SHARE URL
// ============================================================

function getWebsiteBaseUrl(domain: string | null): string | null {
  const value = domain?.trim();

  if (!value) {
    return null;
  }

  const baseUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  return baseUrl.replace(/\/+$/, "");
}

export function getSocialShareUrl(
  domain: string | null,
  slug: string,
): string | null {
  const baseUrl = getWebsiteBaseUrl(domain);

  if (!baseUrl) {
    return null;
  }

  /*
   * Final public Social Share route:
   *
   * https://web-a.com/watch/video-123
   */
  return `${baseUrl}/watch/` + encodeURIComponent(slug);
}

// ============================================================
// SERIALIZER
// ============================================================

export function serializeSocialShare(socialShare: SocialShareRecord) {
  return {
    id: socialShare.id,

    websiteId: socialShare.websiteId,

    title: socialShare.title,

    slug: socialShare.slug,

    description: socialShare.description,

    videoUrl: socialShare.videoUrl,

    thumbnail: socialShare.thumbnail,

    shareThumbnail: socialShare.shareThumbnail,

    duration: socialShare.duration,

    displayDuration: socialShare.displayDuration,

    targetUrl: socialShare.targetUrl,

    status: socialShare.status,

    shareUrl: getSocialShareUrl(socialShare.website.domain, socialShare.slug),

    website: {
      id: socialShare.website.id,

      name: socialShare.website.name,

      slug: socialShare.website.slug,

      domain: socialShare.website.domain,

      status: socialShare.website.status,
    },

    createdAt: socialShare.createdAt,

    updatedAt: socialShare.updatedAt,
  };
}

// ============================================================
// ORDER BY
// ============================================================

export function getSocialShareOrderBy(
  sort: SocialSharesQuery["sort"],
  order: SocialSharesQuery["order"],
) {
  switch (sort) {
    case "title":
      return {
        title: order,
      } as const;

    case "slug":
      return {
        slug: order,
      } as const;

    case "status":
      return {
        status: order,
      } as const;

    case "updatedAt":
      return {
        updatedAt: order,
      } as const;

    case "createdAt":
    default:
      return {
        createdAt: order,
      } as const;
  }
}
