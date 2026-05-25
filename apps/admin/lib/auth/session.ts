import { headers } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth } from "./auth";

export const getSelfHostedSession = async () =>
  auth.api.getSession({
    headers: await headers(),
  });

export const requireSelfHostedSession = async () => {
  const session = await getSelfHostedSession();

  if (!session) {
    redirect("/login");
  }

  return session;
};

export const redirectAuthenticatedSelfHostedUser = async (
  href = "/dashboard",
) => {
  const session = await getSelfHostedSession();

  if (session) {
    redirect(href as Route);
  }
};
