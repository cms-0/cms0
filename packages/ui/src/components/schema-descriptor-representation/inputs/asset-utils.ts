"use client";

import type { AssetKind } from "../helpers";

export type FileDraft = {
  extension: string;
  filename: string;
  mimeType: string;
  name: string;
  size: number;
};

const normalizeExtension = (filename: string) => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "";
};

export const humanizeFilename = (filename: string) =>
  filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const formatBytes = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
};

export const buildFileDraft = (
  file: File,
  fallbackName = humanizeFilename(file.name),
): FileDraft => ({
  extension: normalizeExtension(file.name),
  filename: file.name,
  mimeType: file.type || "application/octet-stream",
  name: fallbackName,
  size: file.size,
});

export const readFileWithProgress = (
  file: File,
  onProgress?: (progress: number) => void,
) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read selected file."));
    reader.onabort = () => reject(new Error("File read was aborted."));
    reader.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    reader.onload = () => {
      onProgress?.(100);
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unexpected file reader result."));
    };

    reader.readAsArrayBuffer(file);
  });

export const readImageDimensions = (file: File) =>
  new Promise<{ height: number; width: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image metadata."));
    };
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };

    image.src = url;
  });

export const readVideoMetadata = (file: File) =>
  new Promise<{ height: number; length: number; width: number }>(
    (resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Unable to read video metadata."));
      };
      video.onloadedmetadata = () => {
        const width = Number.isFinite(video.videoWidth) ? video.videoWidth : 0;
        const height = Number.isFinite(video.videoHeight)
          ? video.videoHeight
          : 0;
        const length = Number.isFinite(video.duration)
          ? Math.round(video.duration)
          : 0;
        URL.revokeObjectURL(url);
        resolve({ width, height, length });
      };

      video.src = url;
    },
  );

export const getAssetAccept = (kind: AssetKind) => {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  return undefined;
};

