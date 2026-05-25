export async function register() {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { bootstrapSelfHostedContentServer } = await import("./lib/self-hosted-bootstrap");
  await bootstrapSelfHostedContentServer();

  const { bootstrapAdminAuth } = await import("./lib/auth/bootstrap-admin");
  await bootstrapAdminAuth();
}
