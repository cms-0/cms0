import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isInvitationPath, normalizeRedirectTarget } from "@/lib/auth/route-intent";

const isProtectedRoute = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/documentation") ||
  pathname.startsWith("/models") ||
  pathname.startsWith("/settings");

export const proxy = (request: NextRequest) => {
  const pathname = request.nextUrl.pathname;
  const isPublicInvitation = isInvitationPath(pathname);

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const forwardedHeaders = new Headers(request.headers);
  if (isPublicInvitation) {
    forwardedHeaders.set("x-cms0-public-invite", "1");
  }

  const sessionCookie = getSessionCookie(request);

  if (isProtectedRoute(pathname) && !isPublicInvitation && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", normalizeRedirectTarget(pathname));
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({
    request: {
      headers: forwardedHeaders,
    },
  });
};
