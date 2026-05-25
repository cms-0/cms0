export type AssetKind = "image" | "video" | "file";

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v|mkv|avi|ogg)$/i;

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

export function joinStorageKey(...segments: string[]): string {
  return segments.map(trimSlashes).filter(Boolean).join("/");
}

export function normalizeAssetFilename(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

export function inferAssetKindFromFilename(filename: string): AssetKind {
  const normalized = normalizeAssetFilename(filename);
  if (VIDEO_EXTENSION.test(normalized)) return "video";
  if (IMAGE_EXTENSION.test(normalized)) return "image";
  return "file";
}

export function getAssetPathSegment(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "images";
    case "video":
      return "videos";
    case "file":
      return "files";
  }
}

export function getAssetLogicalPath(kind: AssetKind, filename: string): string {
  return joinStorageKey(
    "uploads",
    getAssetPathSegment(kind),
    normalizeAssetFilename(filename),
  );
}

export function deriveAssetFilenameFromStorageKey(
  storageKey: string,
): string | undefined {
  const normalized = normalizeAssetFilename(storageKey);
  if (!normalized) return undefined;
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

export function deriveAssetKindFromStorageKey(
  storageKey: string,
): AssetKind | undefined {
  const normalized = normalizeAssetFilename(storageKey);
  const parts = normalized.split("/").filter(Boolean);
  const uploadsIndex = parts.findIndex((part) => part === "uploads");
  const segment = uploadsIndex >= 0 ? parts[uploadsIndex + 1] : parts[0];

  if (segment === "images") return "image";
  if (segment === "videos") return "video";
  if (segment === "files") return "file";
  return undefined;
}
