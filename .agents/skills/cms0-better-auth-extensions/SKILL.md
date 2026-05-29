---
name: cms0-better-auth-extensions
description: Add or extend Better Auth plugins in cms0, including custom endpoints, server/client wiring, and adapter-backed access helpers.
---

# CMS0 Better Auth Extensions

When adding custom Better Auth capabilities in `cms0`:

- Prefer `createAuthEndpoint` + `sessionMiddleware` for custom endpoints.
- Keep app-specific DB logic in the owning app and pass functions into plugin options.
- Keep shared plugin code in `packages/auth/src/...`.
- If a client plugin is needed, expose it from `packages/auth/src/...-client.ts`.
- Keep final Better Auth composition in the owning app, not in `packages/auth`.

## Checklist

1. Add schema changes in the owning app or shared schema package when needed.
2. Implement app-local DB helpers in the owning app.
3. Add or extend the shared plugin in `packages/auth/src/...`.
4. Add a client plugin in `packages/auth/src/...-client.ts` if the UI needs it.
5. Wire the server auth composition in the owning app's auth module.
6. Update affected UI or route handlers to use the new endpoints cleanly.
