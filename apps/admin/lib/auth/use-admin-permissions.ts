"use client";

import {
  getDescriptorSchemaAccess,
  getGeneratedModelAccess,
  getPrimaryOrganizationRole,
} from "@cms0/auth/permissions";

import { authClient } from "./client";

export function useSelfHostedAdminPermissions() {
  const activeMemberQuery = authClient.useActiveMember();
  const sessionQuery = authClient.useSession();
  const role = getPrimaryOrganizationRole(
    activeMemberQuery.data?.role ??
      (typeof sessionQuery.data?.user?.role === "string"
        ? sessionQuery.data.user.role
        : null),
  );
  const generatedModelAccess = getGeneratedModelAccess(role);
  const descriptorAccess = getDescriptorSchemaAccess(role);

  return {
    canCreateGeneratedModels: generatedModelAccess.canCreate,
    canDeleteGeneratedModels: generatedModelAccess.canDelete,
    canPublishDescriptor:
      descriptorAccess.canCreate || descriptorAccess.canUpdate,
    canReadGeneratedModels: generatedModelAccess.canRead,
    canUpdateGeneratedModels: generatedModelAccess.canUpdate,
    isLoading: activeMemberQuery.isPending && sessionQuery.isPending,
    role,
  };
}
