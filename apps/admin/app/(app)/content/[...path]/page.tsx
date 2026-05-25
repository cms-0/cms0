import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";
import { Card, CardDescription, CardHeader, CardTitle } from "@cms0/ui";

import { ContentResourcePanel } from "@/components/content-resource-panel";
import { getSelfHostedAdminServer } from "@/lib/admin-server";

type PageProps = {
  params: Promise<{
    path: string[];
  }>;
};

const DEFAULT_PAGE_SIZE = 10;

export default async function Page({ params }: PageProps) {
  const { path } = await params;
  const resolved = await getSelfHostedAdminServer().getContentResource(path, {
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const segments = path ?? [];

  return (
    <>
      {!resolved ? (
        <Card>
          <CardHeader>
            <CardTitle>Path not found</CardTitle>
            <CardDescription>
              This descriptor path is not present in the latest snapshot.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ContentResourcePanel
          adminBaseUrl={buildSelfHostedAdminBasePath()}
          graphPath={path?.join("/")}
          initialResponse={resolved}
          resourceRouteBase="/content"
          manualTriggerAdminBaseUrl={buildSelfHostedAdminBasePath()}
          manualTriggerResourceName={segments[0] ?? ""}
          manualTriggerResourceType="root"
        />
      )}
    </>
  );
}
