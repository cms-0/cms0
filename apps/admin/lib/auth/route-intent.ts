export type AuthRedirectPattern = RegExp | string;

const DEFAULT_RETURN_TARGET = "/dashboard";
const INVITATION_PATTERNS = [
  "/settings/team/accept-invitation/",
] as const satisfies readonly AuthRedirectPattern[];

const normalizePath = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(trimmed, "https://cms0.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const normalizeEmail = (value: string | null | undefined) => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
};

export const normalizeRedirectTarget = (
  value: string | null | undefined,
  fallback = DEFAULT_RETURN_TARGET,
) => {
  if (!value) {
    return fallback;
  }

  return normalizePath(value) ?? fallback;
};

export const matchesRedirectPattern = (
  value: string | null | undefined,
  patterns: readonly AuthRedirectPattern[],
) => {
  if (patterns.length === 0) {
    return false;
  }

  const normalized = normalizePath(value ?? "");

  if (!normalized) {
    return false;
  }

  return patterns.some((pattern) =>
    typeof pattern === "string"
      ? normalized.startsWith(pattern)
      : pattern.test(normalized),
  );
};

export const isInvitationPath = (value: string | null | undefined) => {
  return matchesRedirectPattern(value, INVITATION_PATTERNS);
};

export const invitationMatchesSessionEmail = (
  invitationEmail: string | null | undefined,
  sessionEmail: string | null | undefined,
) => {
  const normalizedInvitationEmail = normalizeEmail(invitationEmail);
  const normalizedSessionEmail = normalizeEmail(sessionEmail);

  if (!normalizedInvitationEmail || !normalizedSessionEmail) {
    return false;
  }

  return normalizedInvitationEmail === normalizedSessionEmail;
};

export const buildAuthRedirectPath = (
  pathname: "/login" | "/signup",
  redirectTo: string,
  defaultReturnTarget = DEFAULT_RETURN_TARGET,
) =>
  redirectTo === defaultReturnTarget
    ? pathname
    : `${pathname}?redirect=${encodeURIComponent(redirectTo)}`;
