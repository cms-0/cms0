import { runDbPushSafe } from "@cms0/db-schema-ops";
import { readOptionalEnv, readRequiredEnv } from "@/lib/env";

import { auth } from "./auth";

type BootstrapAdminResult = {
  created: boolean;
  organizationCreated: boolean;
  userId: string;
};

const normalizeEmail = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? "";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const getBootstrapConfig = () => {
  const email = normalizeEmail(readOptionalEnv("ADMIN_EMAIL"));
  const password = readOptionalEnv("ADMIN_PASSWORD") ?? "";
  const organizationName = readRequiredEnv("ORG_NAME");

  if ((email && !password) || (!email && password)) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.");
  }

  return {
    email,
    enabled: email.length > 0 && password.length > 0,
    organizationName,
    password,
  };
};

const ensureBootstrapUser = async (input: {
  email: string;
  password: string;
}) => {
  const context = await auth.$context;
  const existingUsers = await context.adapter.findMany<{ id?: string | null }>({
    limit: 1,
    model: "user",
    sortBy: {
      direction: "asc",
      field: "createdAt",
    },
  });
  const existingUserId = existingUsers?.[0]?.id;
  if (typeof existingUserId === "string" && existingUserId.length > 0) {
    return { created: false, userId: existingUserId };
  }

  const minLength = context.password.config.minPasswordLength;
  const maxLength = context.password.config.maxPasswordLength;
  if (input.password.length < minLength || input.password.length > maxLength) {
    throw new Error(
      `ADMIN_PASSWORD must be between ${minLength} and ${maxLength} characters.`,
    );
  }

  const passwordHash = await context.password.hash(input.password);
  const createdUser = await context.adapter.create<{ id?: string | null }>({
    model: "user",
    data: {
      email: input.email,
      emailVerified: true,
      name: "Admin",
      role: "admin",
    },
  });

  const userId = typeof createdUser?.id === "string" ? createdUser.id : null;
  if (!userId) {
    throw new Error("Failed to create bootstrap admin user.");
  }

  await context.adapter.create({
    model: "account",
    data: {
      accountId: userId,
      password: passwordHash,
      providerId: "credential",
      userId,
    },
  });

  return { created: true, userId };
};

const ensureBootstrapOrganization = async (input: {
  organizationName: string;
  userId: string;
}) => {
  const context = await auth.$context;
  const existingOrganizations = await context.adapter.findMany<{
    id?: string | null;
  }>({
    limit: 1,
    model: "organization",
    sortBy: {
      direction: "asc",
      field: "createdAt",
    },
  });
  const existingOrganizationId = existingOrganizations?.[0]?.id;
  if (
    typeof existingOrganizationId === "string" &&
    existingOrganizationId.length > 0
  ) {
    return { created: false };
  }

  const fallbackSlug = slugify(input.organizationName) || "acme-inc";
  await auth.api.createOrganization({
    body: {
      keepCurrentActiveOrganization: false,
      name: input.organizationName,
      slug: fallbackSlug,
      userId: input.userId,
    },
  });
  return { created: true };
};

export const bootstrapAdminAuth =
  async (): Promise<BootstrapAdminResult | null> => {
    const config = getBootstrapConfig();
    if (!config.enabled) {
      return null;
    }

    await runDbPushSafe();
    const user = await ensureBootstrapUser({
      email: config.email,
      password: config.password,
    });
    const organization = await ensureBootstrapOrganization({
      organizationName: config.organizationName,
      userId: user.userId,
    });

    return {
      created: user.created,
      organizationCreated: organization.created,
      userId: user.userId,
    };
  };
