import type { ReactNode } from "react";
import { headers } from "next/headers";

import { Navigation } from "@/components/navigation";
import { ContentHeader } from "@/components/content-header";
import { getSelfHostedSchemaSnapshot } from "@/lib/admin-server";
import { requireSelfHostedSession } from "@/lib/auth/session";
import { getPublicDocsBaseUrl } from "@/lib/env";
import { readSchemaCollectionEntries } from "@/lib/schema-view";
import { AppLayout } from "@cms0/ui";

export const dynamic = "force-dynamic";

const readDescriptorRoots = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readRootsOrderHint = (value: unknown): string[] | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const metadata = (value as Record<string, unknown>).metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const ordering = (metadata as Record<string, unknown>).ordering;
  if (typeof ordering !== "object" || ordering === null || Array.isArray(ordering)) {
    return null;
  }

  const roots = (ordering as Record<string, unknown>).roots;
  if (!Array.isArray(roots)) {
    return null;
  }

  const normalized = roots.filter((item): item is string => typeof item === "string");
  return normalized.length ? normalized : null;
};

const readModelsOrderHint = (value: unknown): string[] | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const metadata = (value as Record<string, unknown>).metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const ordering = (metadata as Record<string, unknown>).ordering;
  if (typeof ordering !== "object" || ordering === null || Array.isArray(ordering)) {
    return null;
  }

  const models = (ordering as Record<string, unknown>).models;
  if (!Array.isArray(models)) {
    return null;
  }

  const normalized = models.filter((item): item is string => typeof item === "string");
  return normalized.length ? normalized : null;
};

export default async function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const requestHeaders = await headers();
  const isPublicInvite = requestHeaders.get("x-cms0-public-invite") === "1";

  if (isPublicInvite) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6 py-12">
        {children}
      </main>
    );
  }

  const session = await requireSelfHostedSession();
  const snapshot = await getSelfHostedSchemaSnapshot();
  const models = readSchemaCollectionEntries(snapshot, "models");
  const roots = readSchemaCollectionEntries(snapshot, "roots");
  const descriptorRoots = readDescriptorRoots(snapshot?.descriptor?.roots);
  const rootsOrderHint = readRootsOrderHint(snapshot?.descriptor);
  const modelsOrderHint = readModelsOrderHint(snapshot?.descriptor);
  const docsBaseUrl = getPublicDocsBaseUrl();

  return (
    <AppLayout
      navigation={
        <Navigation
          descriptorRoots={descriptorRoots}
          docsBaseUrl={docsBaseUrl}
          models={models}
          modelsOrderHint={modelsOrderHint}
          rootsOrderHint={rootsOrderHint}
          roots={roots}
          userEmail={session.user.email}
          userImage={session.user.image}
          userName={session.user.name}
        />
      }
    >
      <>
        <ContentHeader />
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </>
    </AppLayout>
  );
}
