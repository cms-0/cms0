"use client";

import * as React from "react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ContentResourcePanel as SharedContentResourcePanel,
} from "@cms0/ui";

import { useSelfHostedAdminPermissions } from "@/lib/auth/use-admin-permissions";

type ContentResourcePanelProps = Omit<
  React.ComponentProps<typeof SharedContentResourcePanel>,
  "contentAccess"
>;

export function ContentResourcePanel(
  props: Readonly<ContentResourcePanelProps>,
) {
  const permissions = useSelfHostedAdminPermissions();

  if (permissions.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Checking permissions</CardTitle>
          <CardDescription>
            Loading the current self-host role before enabling content actions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <SharedContentResourcePanel
      {...props}
      contentAccess={{
        canCreate: permissions.canCreateGeneratedModels,
        canDelete: permissions.canDeleteGeneratedModels,
        canRead: permissions.canReadGeneratedModels,
        canReorder: permissions.canUpdateGeneratedModels,
        canUpdate: permissions.canUpdateGeneratedModels,
      }}
    />
  );
}
