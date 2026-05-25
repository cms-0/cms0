import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  team: ["create", "update", "delete"],
  apiKey: ["create", "read", "update", "delete"],
  descriptorSchema: ["create", "read", "update", "delete"],
  generatedModels: ["create", "read", "update", "delete"],
  externalTriggers: ["create", "read", "update", "delete", "execute"],
} as const;

export const apiKeyDefaultPermissions = {
  descriptorSchema: statement.descriptorSchema,
  generatedModels: statement.generatedModels,
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  apiKey: ["create", "read", "update", "delete"],
  descriptorSchema: ["create", "read", "update", "delete"],
  generatedModels: ["create", "read", "update", "delete"],
  externalTriggers: ["create", "read", "update", "delete", "execute"],
});

export const admin = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  apiKey: ["create", "read", "update", "delete"],
  descriptorSchema: ["create", "read", "update", "delete"],
  generatedModels: ["create", "read", "update", "delete"],
  externalTriggers: ["create", "read", "update", "delete", "execute"],
});

export const editor = ac.newRole({
  organization: [],
  member: [],
  invitation: ["create"],
  team: ["create", "update"],
  ac: [],
  apiKey: ["read"],
  descriptorSchema: ["read"],
  generatedModels: ["create", "read", "update", "delete"],
  externalTriggers: ["read", "execute"],
});

export const viewer = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  apiKey: ["read"],
  descriptorSchema: ["read"],
  generatedModels: ["read"],
  externalTriggers: ["read"],
});

export const organizationRoleOrder = [
  "owner",
  "admin",
  "editor",
  "viewer",
] as const;

export type OrganizationRoleName = (typeof organizationRoleOrder)[number];
export type AppRole = OrganizationRoleName;

export const organizationRoleLabels: Record<OrganizationRoleName, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const organizationRoles = {
  owner,
  admin,
  editor,
  viewer,
} satisfies Record<OrganizationRoleName, ReturnType<typeof ac.newRole>>;

export const isPrivilegedOrganizationRole = (
  role?: string | null,
): role is "owner" | "admin" => role === "owner" || role === "admin";

export type ResourceCrudAccess = {
  canCreate: boolean;
  canDelete: boolean;
  canRead: boolean;
  canReorder?: boolean;
  canUpdate: boolean;
};

export type ResourceActionAccess = ResourceCrudAccess & {
  canExecute: boolean;
};

export function getPrimaryOrganizationRole(
  role: string | null | undefined,
): OrganizationRoleName {
  if (!role) return "viewer";

  const roles = role
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const candidate of organizationRoleOrder) {
    if (roles.includes(candidate)) {
      return candidate;
    }
  }

  const first = roles[0];
  if (
    first === "owner" ||
    first === "admin" ||
    first === "editor" ||
    first === "viewer"
  ) {
    return first;
  }

  return "viewer";
}

export function isOrganizationRole(value: string): value is OrganizationRoleName {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "editor" ||
    value === "viewer"
  );
}

export const roleHasPermission = (
  role: string | null | undefined,
  permissions: Record<string, string[]>,
) => {
  if (!role) return false;

  const roles = role
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!roles.length) {
    return false;
  }

  for (const roleKey of roles) {
    const typedRole = roleKey as OrganizationRoleName;
    const roleDefinition = organizationRoles[typedRole];
    if (roleDefinition?.authorize(permissions).success) {
      return true;
    }
  }

  return false;
};

export const canManageTeamAccess = (role?: string | null) =>
  roleHasPermission(role, { team: ["update"] });

export const canManageMemberAccess = (role?: string | null) =>
  roleHasPermission(role, { member: ["update"] });

export const getGeneratedModelAccess = (
  role: string | null | undefined,
): ResourceCrudAccess => {
  const canUpdate = roleHasPermission(role, {
    generatedModels: ["update"],
  });

  return {
    canCreate: roleHasPermission(role, {
      generatedModels: ["create"],
    }),
    canDelete: roleHasPermission(role, {
      generatedModels: ["delete"],
    }),
    canRead: roleHasPermission(role, {
      generatedModels: ["read"],
    }),
    canReorder: canUpdate,
    canUpdate,
  };
};

export const getDescriptorSchemaAccess = (
  role: string | null | undefined,
): ResourceCrudAccess => ({
  canCreate: roleHasPermission(role, {
    descriptorSchema: ["create"],
  }),
  canDelete: roleHasPermission(role, {
    descriptorSchema: ["delete"],
  }),
  canRead: roleHasPermission(role, {
    descriptorSchema: ["read"],
  }),
  canUpdate: roleHasPermission(role, {
    descriptorSchema: ["update"],
  }),
});

export const getExternalTriggerAccess = (
  role: string | null | undefined,
): ResourceActionAccess => ({
  canCreate: roleHasPermission(role, {
    externalTriggers: ["create"],
  }),
  canDelete: roleHasPermission(role, {
    externalTriggers: ["delete"],
  }),
  canExecute: roleHasPermission(role, {
    externalTriggers: ["execute"],
  }),
  canRead: roleHasPermission(role, {
    externalTriggers: ["read"],
  }),
  canUpdate: roleHasPermission(role, {
    externalTriggers: ["update"],
  }),
});
