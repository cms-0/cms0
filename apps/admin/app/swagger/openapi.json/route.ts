import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { createSelfHostedApiReference } from "@/lib/api-reference";
import { getSelfHostedAdminServer } from "@/lib/admin-server";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch latest descriptor for dynamic route generation
  const adminServer = getSelfHostedAdminServer();
  const snapshot = await adminServer.getLatestSchemaSnapshot();

  return NextResponse.json(
    createSelfHostedApiReference(
      snapshot?.descriptor as Record<string, unknown> | undefined,
    ).spec ?? {},
    {
      headers: {
        "cache-control": "private, no-store",
      },
    },
  );
}
