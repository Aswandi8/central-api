import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/api-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);

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
    website: {
      id: auth.website.id,
      name: auth.website.name,
      slug: auth.website.slug,
      status: auth.website.status,
    },
  });
}
