import type { NextRequest } from "next/server";
import { createContentHandler } from "@cms0/admin-server";
import { getSelfHostedAdminServer } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handle = createContentHandler({
  getServer: getSelfHostedAdminServer,
});

type ContentRouteContext = {
  params: Promise<{ slug?: string[] }>;
};

const route = (request: NextRequest, context: ContentRouteContext) =>
  handle(request, context);

export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
export const HEAD = route;
export const OPTIONS = route;
