#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/env-generator-lib.sh
source "$SCRIPT_DIR/env-generator-lib.sh"

APP_NAME="admin"
APP_ENV_FILE="$ROOT_DIR/apps/admin/.env.local"

echo "Generating @cms0/admin environment profile"
echo "Output directory: $OUTPUT_DIR"
echo "Press Enter to accept defaults. Optional values can be left empty."
echo

select_profile "$APP_NAME" "$APP_ENV_FILE"

section \
  "1) Core app + auth runtime" \
  "Configure self-host app identity, auth secrets, trusted origins, and bootstrap settings." \
  "Login/session behavior, invite-only signup, bootstrap admin, and generated URLs."

PORT="$(ask "PORT" "Port" "3000" true)"
BETTER_AUTH_URL="$(ask "BETTER_AUTH_URL" "Better Auth URL" "http://localhost:3000" true)"
BETTER_AUTH_SECRET="$(ask "BETTER_AUTH_SECRET" "Better Auth secret" "" true)"
CMS0_PUBLIC_APP_URL="$(ask "CMS0_PUBLIC_APP_URL" "Canonical admin app URL" "$BETTER_AUTH_URL" true)"
TRUSTED_ORIGINS="$(ask "TRUSTED_ORIGINS" "Trusted origins (comma-separated)" "http://localhost:3000,http://127.0.0.1:3000" true)"
ADMIN_EMAIL="$(ask "ADMIN_EMAIL" "Bootstrap admin email (optional)" "" false)"
ADMIN_PASSWORD="$(ask "ADMIN_PASSWORD" "Bootstrap admin password (required with ADMIN_EMAIL)" "" false)"
ORG_NAME="$(ask "ORG_NAME" "Bootstrap organization name" "Acme Inc." true)"
GOOGLE_CLIENT_ID="$(ask "GOOGLE_CLIENT_ID" "Google OAuth client ID (optional)" "" false)"
GOOGLE_CLIENT_SECRET="$(ask "GOOGLE_CLIENT_SECRET" "Google OAuth client secret (optional)" "" false)"

section \
  "2) Database and schema tooling" \
  "Configure the self-host database and schema tooling." \
  "Drizzle, Better Auth adapter, schema push, backups, restore tooling."

DATABASE_URL="$(ask "DATABASE_URL" "Database URL" "" true)"
DRIZZLE_DIALECT="$(ask "DRIZZLE_DIALECT" "Drizzle dialect" "postgresql" true)"
CMS0_DB_PUSH_ATTEMPTS="$(ask "CMS0_DB_PUSH_ATTEMPTS" "DB push attempts" "3" false)"
CMS0_DB_PUSH_RETRY_DELAY_MS="$(ask "CMS0_DB_PUSH_RETRY_DELAY_MS" "DB push retry delay ms" "200" false)"

section \
  "3) Email delivery" \
  "Configure outbound email for auth, team invitations, and transactional flows." \
  "Self-host email service and Better Auth invitation hooks."

CMS0_EMAIL_TRANSPORT="$(ask "CMS0_EMAIL_TRANSPORT" "Email transport (log/smtp/plunk)" "log" true)"
CMS0_EMAIL_PLUNK_API_KEY="$(ask "CMS0_EMAIL_PLUNK_API_KEY" "Plunk API key (required when transport=plunk)" "" false)"
CMS0_EMAIL_FROM="$(ask "CMS0_EMAIL_FROM" "Default from email" "no-reply@example.com" true)"
CMS0_EMAIL_FROM_NAME="$(ask "CMS0_EMAIL_FROM_NAME" "Default from name" "cms0" false)"
CMS0_EMAIL_REPLY_TO="$(ask "CMS0_EMAIL_REPLY_TO" "Reply-to email (optional)" "" false)"
CMS0_EMAIL_REPLY_TO_NAME="$(ask "CMS0_EMAIL_REPLY_TO_NAME" "Reply-to name (optional)" "" false)"
CMS0_EMAIL_SMTP_HOST="$(ask "CMS0_EMAIL_SMTP_HOST" "SMTP host (required when transport=smtp)" "" false)"
CMS0_EMAIL_SMTP_PORT="$(ask "CMS0_EMAIL_SMTP_PORT" "SMTP port" "587" true)"
CMS0_EMAIL_SMTP_SECURE="$(ask "CMS0_EMAIL_SMTP_SECURE" "SMTP secure? (true/false)" "false" true)"
CMS0_EMAIL_SMTP_USERNAME="$(ask "CMS0_EMAIL_SMTP_USERNAME" "SMTP username (optional)" "" false)"
CMS0_EMAIL_SMTP_PASSWORD="$(ask "CMS0_EMAIL_SMTP_PASSWORD" "SMTP password (optional)" "" false)"
CMS0_EMAIL_PLUNK_BASE_URL="$(ask "CMS0_EMAIL_PLUNK_BASE_URL" "Plunk base URL (optional)" "" false)"
NEXT_PUBLIC_ENABLE_EMAIL="$(ask "NEXT_PUBLIC_ENABLE_EMAIL" "Enable email UI? (true/false)" "true" true)"

section \
  "4) Storage and backups" \
  "Configure runtime asset storage, public asset URLs, and backup retention." \
  "Uploads, content media, generated asset URLs, and backup jobs."

CMS0_STORAGE_PATH="$(ask "CMS0_STORAGE_PATH" "Filesystem storage path" "./storage" true)"
CMS0_ASSET_BASE_URL="$(ask "CMS0_ASSET_BASE_URL" "Asset base URL" "$CMS0_PUBLIC_APP_URL" true)"
CMS0_STORAGE_DRIVER="$(ask "CMS0_STORAGE_DRIVER" "Storage driver (filesystem/s3)" "filesystem" true)"
CMS0_STORAGE_BUCKET="$(ask "CMS0_STORAGE_BUCKET" "S3 bucket (required when driver=s3)" "" false)"
CMS0_STORAGE_REGION="$(ask "CMS0_STORAGE_REGION" "S3 region" "auto" false)"
CMS0_STORAGE_ENDPOINT="$(ask "CMS0_STORAGE_ENDPOINT" "S3 endpoint (optional)" "" false)"
CMS0_STORAGE_ACCESS_KEY_ID="$(ask "CMS0_STORAGE_ACCESS_KEY_ID" "S3 access key (required when driver=s3)" "" false)"
CMS0_STORAGE_SECRET_ACCESS_KEY="$(ask "CMS0_STORAGE_SECRET_ACCESS_KEY" "S3 secret key (required when driver=s3)" "" false)"
CMS0_STORAGE_FORCE_PATH_STYLE="$(ask "CMS0_STORAGE_FORCE_PATH_STYLE" "S3 force path style? (true/false)" "true" false)"
CMS0_STORAGE_PREFIX="$(ask "CMS0_STORAGE_PREFIX" "S3 object prefix (optional)" "" false)"
CMS0_BACKUPS_PATH="$(ask "CMS0_BACKUPS_PATH" "Backups path" "./storage/backups" false)"
CMS0_BACKUPS_RETENTION="$(ask "CMS0_BACKUPS_RETENTION" "Backup retention count" "3" false)"

section \
  "5) Test helpers" \
  "Configure local browser test target." \
  "E2E scripts and local verification."

E2E_BASE_URL="$(ask "E2E_BASE_URL" "E2E base URL" "http://localhost:4102" false)"

cat > "$OUTPUT_FILE" <<EOF
# Generated by scripts/generate-admin-env.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Target app: @cms0/admin

# Server
PORT=$PORT

# Auth
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
BETTER_AUTH_URL=$BETTER_AUTH_URL
CMS0_PUBLIC_APP_URL=$CMS0_PUBLIC_APP_URL
TRUSTED_ORIGINS=$TRUSTED_ORIGINS

GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ORG_NAME=$ORG_NAME

# Database
DATABASE_URL=$DATABASE_URL
DRIZZLE_DIALECT=$DRIZZLE_DIALECT
CMS0_DB_PUSH_ATTEMPTS=$CMS0_DB_PUSH_ATTEMPTS
CMS0_DB_PUSH_RETRY_DELAY_MS=$CMS0_DB_PUSH_RETRY_DELAY_MS

# Email delivery
CMS0_EMAIL_TRANSPORT=$CMS0_EMAIL_TRANSPORT
CMS0_EMAIL_PLUNK_API_KEY=$CMS0_EMAIL_PLUNK_API_KEY
CMS0_EMAIL_FROM=$CMS0_EMAIL_FROM
CMS0_EMAIL_FROM_NAME=$CMS0_EMAIL_FROM_NAME
CMS0_EMAIL_REPLY_TO=$CMS0_EMAIL_REPLY_TO
CMS0_EMAIL_REPLY_TO_NAME=$CMS0_EMAIL_REPLY_TO_NAME
CMS0_EMAIL_SMTP_HOST=$CMS0_EMAIL_SMTP_HOST
CMS0_EMAIL_SMTP_PORT=$CMS0_EMAIL_SMTP_PORT
CMS0_EMAIL_SMTP_SECURE=$CMS0_EMAIL_SMTP_SECURE
CMS0_EMAIL_SMTP_USERNAME=$CMS0_EMAIL_SMTP_USERNAME
CMS0_EMAIL_SMTP_PASSWORD=$CMS0_EMAIL_SMTP_PASSWORD
CMS0_EMAIL_PLUNK_BASE_URL=$CMS0_EMAIL_PLUNK_BASE_URL
NEXT_PUBLIC_ENABLE_EMAIL=$NEXT_PUBLIC_ENABLE_EMAIL

# Storage and backups
CMS0_STORAGE_PATH=$CMS0_STORAGE_PATH
CMS0_ASSET_BASE_URL=$CMS0_ASSET_BASE_URL
CMS0_STORAGE_DRIVER=$CMS0_STORAGE_DRIVER
CMS0_STORAGE_BUCKET=$CMS0_STORAGE_BUCKET
CMS0_STORAGE_REGION=$CMS0_STORAGE_REGION
CMS0_STORAGE_ENDPOINT=$CMS0_STORAGE_ENDPOINT
CMS0_STORAGE_ACCESS_KEY_ID=$CMS0_STORAGE_ACCESS_KEY_ID
CMS0_STORAGE_SECRET_ACCESS_KEY=$CMS0_STORAGE_SECRET_ACCESS_KEY
CMS0_STORAGE_FORCE_PATH_STYLE=$CMS0_STORAGE_FORCE_PATH_STYLE
CMS0_STORAGE_PREFIX=$CMS0_STORAGE_PREFIX
CMS0_BACKUPS_PATH=$CMS0_BACKUPS_PATH
CMS0_BACKUPS_RETENTION=$CMS0_BACKUPS_RETENTION

# E2E helpers
E2E_BASE_URL=$E2E_BASE_URL
EOF

echo
echo "Generated:"
echo "  $OUTPUT_FILE"
if [ -n "$DEFAULTS_FILE" ]; then
  echo "Defaults source:"
  echo "  $DEFAULTS_FILE"
fi
echo
echo "Next:"
echo "  Review the file, then copy the values you want into apps/admin/.env.local or your deploy provider."
