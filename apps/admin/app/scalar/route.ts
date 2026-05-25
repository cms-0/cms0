import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { renderScalarUIHtml } from "@cms0/api-docs";

import { auth } from "@/lib/auth/auth";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(
    renderScalarUIHtml({
      specUrl: "/swagger/openapi.json",
      title: "cms0 API",
    }),
    {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
