import { NextResponse } from "next/server";

import { requireWebsitePermission } from "@/lib/admin/auth-admin";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

async function getApiClient(id: string) {
  return prisma.apiClient.findUnique({
    where: {
      id,
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

      website: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const client = await getApiClient(id);

  if (!client) {
    return NextResponse.json(
      {
        success: false,
        error: "API client not found",
      },
      {
        status: 404,
      },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    client.websiteId,
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

  return NextResponse.json({
    success: true,
    data: client,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const client = await getApiClient(id);

  if (!client) {
    return NextResponse.json(
      {
        success: false,
        error: "API client not found",
      },
      {
        status: 404,
      },
    );
  }

  const auth = await requireWebsitePermission(
    request,
    client.websiteId,
    "api_client.revoke",
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

  if (client.status === "REVOKED") {
    return NextResponse.json(
      {
        success: false,
        error: "API client is already revoked",
      },
      {
        status: 409,
      },
    );
  }

  const revoked = await prisma.apiClient.update({
    where: {
      id,
    },

    data: {
      status: "REVOKED",
    },

    select: {
      id: true,
      websiteId: true,
      name: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    message: "API client revoked successfully",
    data: revoked,
  });
}
