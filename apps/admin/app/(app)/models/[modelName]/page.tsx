import { notFound } from "next/navigation";

import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";

import { ContentResourcePanel } from "@/components/content-resource-panel";
import {
  getSelfHostedAdminServer,
  getSelfHostedSchemaSnapshot,
} from "@/lib/admin-server";
import { getSchemaEntryByName } from "@/lib/schema-view";

type PageProps = {
  params: Promise<{
    modelName: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { modelName } = await params;
  const snapshot = await getSelfHostedSchemaSnapshot();
  const model = getSchemaEntryByName(snapshot, "models", modelName);
  const resource = await getSelfHostedAdminServer().getContentResource(
    `models/${modelName}`,
  );

  if (!model || !resource) {
    notFound();
  }

  return (
    <ContentResourcePanel
      adminBaseUrl={buildSelfHostedAdminBasePath()}
      graphPath={`models/${modelName}`}
      initialResponse={resource}
      resourceRouteBase={`/models/${encodeURIComponent(model.name)}`}
      manualTriggerAdminBaseUrl={buildSelfHostedAdminBasePath()}
      manualTriggerResourceName={model.name}
      manualTriggerResourceType="model"
    />
  );
}
