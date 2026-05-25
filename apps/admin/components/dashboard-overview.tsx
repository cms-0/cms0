import "server-only";

import Link from "next/link";

import type { SchemaDescriptorSnapshot } from "@cms0/admin-contract";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@cms0/ui";

import { getPublicDocsBaseUrl } from "@/lib/env";
import {
  countSchemaFields,
  readSchemaCollectionEntries,
} from "@/lib/schema-view";

type DashboardOverviewProps = {
  initialSnapshot: SchemaDescriptorSnapshot | null;
  signedInName: string;
};

export const DashboardOverview = ({
  initialSnapshot,
  signedInName,
}: Readonly<DashboardOverviewProps>) => {
  const docsBaseUrl = getPublicDocsBaseUrl();
  const gettingStartedHref = `${docsBaseUrl}/getting-started/`;
  const roots = readSchemaCollectionEntries(initialSnapshot, "roots");
  const models = readSchemaCollectionEntries(initialSnapshot, "models");
  const totalRootFields = countSchemaFields(roots);
  const totalModelFields = countSchemaFields(models);
  const hasDescriptor = roots.length > 0 || models.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {signedInName}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Roots</CardTitle>
            <CardDescription>Top-level content structures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{roots.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalRootFields} fields defined
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
            <CardDescription>Reusable content types</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{models.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalModelFields} fields defined
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Schema Status</CardTitle>
            <CardDescription>Descriptor availability</CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className={
                hasDescriptor
                  ? "text-sm text-emerald-600"
                  : "text-sm text-muted-foreground"
              }
            >
              {hasDescriptor ? "Active" : "Empty"}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasDescriptor ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Roots</CardTitle>
              <CardDescription>
                Generated endpoints for top-level nodes
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {roots.map((root, index) => {
                const fields = root.fields.map((field) => field.name);
                return (
                  <div key={root.name} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/content/${encodeURIComponent(root.name)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {root.name}
                      </Link>
                      <Badge variant="secondary">{fields.length} fields</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fields.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No fields yet
                        </span>
                      ) : (
                        fields.slice(0, 6).map((field) => (
                          <Badge key={field} variant="outline">
                            {field}
                          </Badge>
                        ))
                      )}
                      {fields.length > 6 ? (
                        <Badge variant="outline">
                          +{fields.length - 6} more
                        </Badge>
                      ) : null}
                    </div>
                    <Separator />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Models</CardTitle>
              <CardDescription>
                Reusable types referenced by roots
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {models.map((model, index) => {
                const fields = model.fields.map((field) => field.name);
                return (
                  <div key={model.name} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/models/${encodeURIComponent(model.name)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {model.name}
                      </Link>
                      <Badge variant="secondary">{fields.length} fields</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fields.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No fields yet
                        </span>
                      ) : (
                        fields.slice(0, 6).map((field) => (
                          <Badge key={field} variant="outline">
                            {field}
                          </Badge>
                        ))
                      )}
                      {fields.length > 6 ? (
                        <Badge variant="outline">
                          +{fields.length - 6} more
                        </Badge>
                      ) : null}
                    </div>
                    <Separator />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Create your first schema and publish it to the admin
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert">
            <p>
              Read the full walkthrough in{" "}
              <a
                href={gettingStartedHref}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                Get Started
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
