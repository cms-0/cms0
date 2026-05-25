import type { NextRequest } from "next/server";
import {
  CORS_HEADERS,
  handleUploadAssetRequest,
  readBody,
  toHttpResponse,
} from "@cms0/admin-server";
import type { AdminRequestMethod } from "@cms0/admin-contract";

import { configureSelfHostedAdminServer } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handle = async (
  request: NextRequest,
  context: {
    params: Promise<{ path?: string[] }>;
  },
) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { path = [] } = await context.params;
  configureSelfHostedAdminServer();
  const result = await handleUploadAssetRequest(
    { environmentKey: "self-hosted" },
    {
      body: await readBody(request),
      headers: request.headers,
      method: request.method as AdminRequestMethod,
      searchParams: request.nextUrl.searchParams,
      segments: path,
    },
  );

  return toHttpResponse(result);
};

export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
