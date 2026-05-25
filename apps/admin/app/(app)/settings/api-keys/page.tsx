import { headers } from "next/headers";

import { getOrganizationApiKeyAccess, listOrganizationApiKeys } from "@cms0/auth";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cms0/ui";
import { apiKeyDefaultPermissions } from "@cms0/auth/permissions";

import { auth } from "@/lib/auth/auth";
import { ApiKeyListActions } from "./api-key-list-actions";

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

export default async function Page() {
  const requestHeaders = await headers();
  const access = await getOrganizationApiKeyAccess(auth, requestHeaders);
  const apiKeys = access.canRead
    ? await listOrganizationApiKeys(auth, requestHeaders, "self-hosted")
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage keys for API access.
          </p>
        </div>
        {access.canCreate ? (
          <Button asChild>
            <a href="/settings/api-keys/create">Create key</a>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
          <CardDescription>
            Copy the full key right after creation. It won&apos;t be shown
            again.
          </CardDescription>
        </CardHeader>
        <CardContent className="w-full">
          {!access.canRead ? (
            <div className="text-sm text-muted-foreground">
              You don&apos;t have access to API keys.
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">
                      {key.name || "Untitled key"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {key.start || key.prefix || key.id}
                    </TableCell>
                    <TableCell>
                      {Object.keys(key.permissionsByResource ?? {}).length ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(
                            key.permissionsByResource ?? apiKeyDefaultPermissions,
                          ).map(([resource, actions]) => (
                            <span
                              key={resource}
                              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {resource}: {actions.join(", ")}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {key.status === "active"
                          ? "Active"
                          : key.status === "disabled"
                            ? "Disabled"
                          : key.status === "expired"
                            ? "Expired"
                            : key.status === "revoked"
                              ? "Revoked"
                              : key.status}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(key.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      <ApiKeyListActions
                        canDelete={access.canDelete}
                        canUpdate={access.canUpdate}
                        keyId={key.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
