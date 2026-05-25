function readRequiredPublicEnv(name: string, value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

function readPublicBooleanEnv(name: string, value: string | undefined) {
  const resolved = readRequiredPublicEnv(name, value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(resolved)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(resolved)) {
    return false;
  }
  throw new Error(`${name} must be a boolean value.`);
}

export function isPublicEmailEnabled() {
  return readPublicBooleanEnv(
    "NEXT_PUBLIC_ENABLE_EMAIL",
    process.env.NEXT_PUBLIC_ENABLE_EMAIL,
  );
}
