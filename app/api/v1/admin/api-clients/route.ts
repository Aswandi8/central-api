import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

const createApiClientSchema = z.object({
  websiteId: z.string().trim().min(1, "Website is required"),
  name: z.string().trim().min(1, "Client name is required").max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function createApiKey(): string {
  return `veyra_${crypto.randomBytes(32).toString("hex")}`;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const websiteId = searchParams.get("websiteId")?.trim() ?? "";

  if (!websiteId) {
    return NextResponse.json(
      {
        success: false,
        error: "websiteId is required",
      },
      {
        status: 400,
      },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    websiteId,
    "api_client.read",
  );

  if (!auth.success) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
      },
      {
        status: auth.status,
      },
    );
  }

  const clients = await prisma.apiClient.findMany({
    where: {
      websiteId,
    },

    orderBy: {
      createdAt: "desc",
    },

    select: {
      id: true,
      websiteId: true,
      name: true,
      description: true,
      status: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: clients,
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = createApiClientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid API client data",
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  const auth = await requireWebsitePermission(
    request,
    data.websiteId,
    "api_client.create",
  );

  if (!auth.success) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
      },
      {
        status: auth.status,
      },
    );
  }

  const website = await prisma.website.findUnique({
    where: {
      id: data.websiteId,
    },

    select: {
      id: true,
    },
  });

  if (!website) {
    return NextResponse.json(
      {
        success: false,
        error: "Website not found",
      },
      {
        status: 404,
      },
    );
  }

  const rawKey = createApiKey();
  const keyHash = hashApiKey(rawKey);

  const client = await prisma.apiClient.create({
    data: {
      websiteId: data.websiteId,
      name: data.name,
      description: data.description ?? null,
      keyHash,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },

    select: {
      id: true,
      websiteId: true,
      name: true,
      description: true,
      status: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "API client created successfully",

      data: {
        ...client,

        /*
         * Raw API key hanya dikembalikan sekali.
         * Database hanya menyimpan hash.
         */
        apiKey: rawKey,
      },
    },
    {
      status: 201,
    },
  );
}
