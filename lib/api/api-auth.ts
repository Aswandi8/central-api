import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api/api-key";

export async function authenticateApiRequest(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey) {
    return {
      success: false as const,
      status: 401,
      error: "API key is required",
    };
  }

  const keyHash = hashApiKey(apiKey);

  const apiClient = await prisma.apiClient.findUnique({
    where: {
      keyHash,
    },
    include: {
      website: true,
    },
  });

  if (!apiClient) {
    return {
      success: false as const,
      status: 401,
      error: "Invalid API key",
    };
  }

  if (apiClient.status !== "ACTIVE") {
    return {
      success: false as const,
      status: 403,
      error: "API client is inactive",
    };
  }

  if (apiClient.expiresAt && apiClient.expiresAt <= new Date()) {
    return {
      success: false as const,
      status: 403,
      error: "API key has expired",
    };
  }

  return {
    success: true as const,
    apiClient,
    website: apiClient.website,
  };
}
