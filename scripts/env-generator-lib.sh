#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/scripts/generated-env"
OUTPUT_FILE=""
DEFAULTS_FILE=""
ENV_LABEL="local"

mkdir -p "$OUTPUT_DIR"

label_to_slug() {
  local label="$1"
  local slug=""
  slug="$(printf '%s' "$label" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  if [ -z "$slug" ]; then
    slug="local"
  fi
  printf '%s' "$slug"
}

profile_file_for_app_label() {
  local app="$1"
  local label="$2"
  local slug=""
  slug="$(label_to_slug "$label")"
  printf '%s/%s.%s.env.local' "$OUTPUT_DIR" "$app" "$slug"
}

default_value_for_key() {
  local key="$1"
  local fallback="${2:-}"
  local line=""

  if [ -n "$DEFAULTS_FILE" ] && [ -f "$DEFAULTS_FILE" ]; then
    line="$(
      awk -F= -v target="$key" '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*$/ { next }
        {
          current=$1
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", current)
          if (current == target) {
            sub(/^[^=]*=/, "", $0)
            print "__FOUND__" $0
            exit
          }
        }
      ' "$DEFAULTS_FILE" 2>/dev/null || true
    )"
    if [[ "$line" == __FOUND__* ]]; then
      printf '%s' "${line#__FOUND__}"
      return
    fi
  fi

  printf '%s' "$fallback"
}

list_existing_profile_labels() {
  local app="$1"
  local file=""
  local base=""
  local label=""

  for file in "$OUTPUT_DIR"/"$app".*.env.local; do
    if [ ! -f "$file" ]; then
      continue
    fi
    base="$(basename "$file")"
    label="${base#"$app".}"
    label="${label%.env.local}"
    if [ -n "$label" ]; then
      printf '%s\n' "$label"
    fi
  done
}

resolve_existing_profile_file() {
  local app="$1"
  local label="$2"
  local file=""
  file="$(profile_file_for_app_label "$app" "$label")"
  if [ -f "$file" ]; then
    printf '%s' "$file"
    return
  fi
  printf '%s' ""
}

print_existing_profile_labels() {
  local app="$1"
  local labels=""
  labels="$(list_existing_profile_labels "$app" | sort -u || true)"
  if [ -z "$labels" ]; then
    echo "Existing labels: (none)"
    return
  fi
  echo "Existing labels:"
  printf '%s\n' "$labels" | sed 's/^/  - /'
}

ask() {
  local key="$1"
  local prompt="$2"
  local default_value="${3:-}"
  local required="${4:-false}"
  local prefer_explicit_default="${5:-false}"
  local value=""
  local effective_default="$default_value"

  if [ "$prefer_explicit_default" != "true" ]; then
    effective_default="$(default_value_for_key "$key" "$default_value")"
  fi

  while true; do
    if [ -n "$effective_default" ]; then
      read -r -p "$prompt [$effective_default]: " value || true
    else
      read -r -p "$prompt: " value || true
    fi

    if [ -z "$value" ]; then
      value="$effective_default"
    fi

    if [ "$required" = "true" ] && [ -z "$value" ]; then
      echo "$key is required."
      continue
    fi
    break
  done

  printf '%s' "$value"
}

section() {
  local title="$1"
  local purpose="$2"
  local impact="$3"
  echo
  echo "==============================================================================="
  echo "$title"
  echo "Purpose: $purpose"
  echo "Affects: $impact"
  echo "==============================================================================="
}

subsection() {
  local title="$1"
  local note="$2"
  echo
  echo "--- $title ---"
  echo "$note"
}

select_profile() {
  local app="$1"
  local app_defaults_file="$2"
  local source_label=""
  local source_file=""
  local profile_mode=""

  echo "Profile mode:"
  echo "  1) Create new environment profile"
  echo "  2) Update existing generated profile"
  echo "  3) Create new profile by copying an existing generated label"
  profile_mode="$(ask "PROFILE_MODE" "Choose mode (1/2/3)" "1" true true)"

  if [ "$profile_mode" = "2" ] || [ "$profile_mode" = "3" ]; then
    if [ -z "$(list_existing_profile_labels "$app" || true)" ]; then
      echo
      echo "No existing generated profiles found. Falling back to create mode."
      profile_mode="1"
    fi
  fi

  if [ "$profile_mode" = "2" ] || [ "$profile_mode" = "3" ]; then
    while true; do
      echo
      print_existing_profile_labels "$app"
      source_label="$(ask "SOURCE_ENV_LABEL" "Existing environment label" "local" true true)"
      source_file="$(resolve_existing_profile_file "$app" "$source_label")"
      if [ -n "$source_file" ]; then
        DEFAULTS_FILE="$source_file"
        echo "Loaded defaults from: $DEFAULTS_FILE"
        break
      fi
      echo "No profile file found for label '$source_label'."
    done
  fi

  if [ "$profile_mode" = "3" ]; then
    ENV_LABEL="$(ask "TARGET_ENV_LABEL" "New environment label" "${source_label}-copy" true true)"
  elif [ "$profile_mode" = "2" ]; then
    ENV_LABEL="$source_label"
  else
    ENV_LABEL="$(ask "TARGET_ENV_LABEL" "Environment label" "local" true true)"
    source_file="$(resolve_existing_profile_file "$app" "$ENV_LABEL")"
    if [ -n "$source_file" ]; then
      DEFAULTS_FILE="$source_file"
      echo "Loaded defaults from existing generated label '$ENV_LABEL': $DEFAULTS_FILE"
    elif [ -f "$app_defaults_file" ]; then
      DEFAULTS_FILE="$app_defaults_file"
      echo "Loaded defaults from app env: $DEFAULTS_FILE"
    fi
  fi

  OUTPUT_FILE="$(profile_file_for_app_label "$app" "$ENV_LABEL")"
}
