# Docker Admin Deployment

This folder contains the local-first Docker Compose setup for `@cms0/admin`.

The stack runs:

- `admin`: the self-hosted cms0 admin app
- `postgres`: a Postgres database for auth, schema snapshots, content, API keys, backups, triggers, and usage

## Quickstart

From the repository root:

```bash
cp deploy/docker/admin.env.example deploy/docker/admin.env
```

Edit `deploy/docker/admin.env` before first use. At minimum, replace the auth secret, bootstrap admin email, and bootstrap admin password.
Compose intentionally fails if `deploy/docker/admin.env` is missing.

Then run:

```bash
pnpm docker:admin:build
pnpm docker:admin:up
```

Open `http://localhost:3000` and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Runtime Shape

The Docker image intentionally uses the normal Next.js production runtime:

```bash
next start --hostname 0.0.0.0 --port 3000
```

It does not use Next standalone output. The image keeps the built monorepo runtime available because `@cms0/admin` still needs workspace package code, `drizzle-kit`, and generated schema files during self-hosted startup and schema sync.

## Volumes

The Compose stack creates two named volumes:

- `cms0_postgres_data`: Postgres data
- `cms0_admin_storage`: uploaded assets, snapshots, and backup archives

Do not delete these volumes unless you intend to delete local data.

## Health Checks

The container health check calls:

```bash
curl http://localhost:3000/api/health
```

That endpoint returns `200` only when the app can query Postgres with `select 1`. It does not expose secrets, connection strings, schema details, or runtime API metadata.

The authenticated content runtime health endpoint remains under `/api/content/health`.

## Email

The default example uses:

```bash
CMS0_EMAIL_TRANSPORT=log
```

With log transport, invitation emails are printed to the admin container logs. Configure SMTP or Plunk before using this stack for a real team.

## Storage

Filesystem storage is the default because it works with a named Docker volume. For a hardened production deployment, use S3-compatible storage and set the storage variables documented in `apps/docs/content/self-hosting/environment-variables.mdx`.

## Stop The Stack

```bash
pnpm docker:admin:down
```

This stops containers but keeps named volumes.
