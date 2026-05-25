"use client";

import * as React from "react";

import { FileIcon, Film, ImageIcon, RefreshCcw, Upload } from "lucide-react";

import { Badge } from "../../badge";
import { Button } from "../../button";
import { Card, CardContent } from "../../card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../field";
import { Input } from "../../input";
import type { AssetKind } from "../helpers";
import {
  buildFileDraft,
  formatBytes,
  getAssetAccept,
  humanizeFilename,
  readFileWithProgress,
  readImageDimensions,
  readVideoMetadata,
  type FileDraft,
} from "./asset-utils";

type AssetModelFormProps = {
  disabled?: boolean;
  initialValue?: Record<string, unknown> | null;
  kind: AssetKind;
  label?: string;
  submitLabel: string;
  onSubmit: (payload: FormData | Record<string, unknown>) => Promise<void> | void;
};

type FormValues = {
  alt: string;
  extension: string;
  filename: string;
  height: number | null;
  length: number | null;
  mimeType: string;
  name: string;
  size: number | null;
  storageKey: string;
  url: string;
  width: number | null;
};

const toNumberOrNull = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringOrEmpty = (value: unknown) =>
  typeof value === "string" ? value : "";

const normalizeValues = (
  value: Record<string, unknown> | null | undefined,
): FormValues => ({
  alt: toStringOrEmpty(value?.alt),
  extension: toStringOrEmpty(value?.extension),
  filename: toStringOrEmpty(value?.filename),
  height: toNumberOrNull(value?.height),
  length: toNumberOrNull(value?.length),
  mimeType: toStringOrEmpty(value?.mimeType),
  name: toStringOrEmpty(value?.name),
  size: toNumberOrNull(value?.size),
  storageKey: toStringOrEmpty(value?.storageKey),
  url: toStringOrEmpty(value?.url),
  width: toNumberOrNull(value?.width),
});

const hasInitialAsset = (value: FormValues) =>
  value.filename.trim().length > 0 ||
  value.storageKey.trim().length > 0 ||
  value.url.trim().length > 0;

const toSignaturePart = (value: unknown) =>
  value == null ? "" : String(value);

const buildInitialValueSignature = (
  rawValue: Record<string, unknown> | null | undefined,
  value: FormValues,
) =>
  [
    rawValue?.id,
    value.alt,
    value.extension,
    value.filename,
    value.height,
    value.length,
    value.mimeType,
    value.name,
    value.size,
    value.storageKey,
    value.url,
    value.width,
  ]
    .map(toSignaturePart)
    .join("\u001f");

export function AssetModelForm({
  disabled = false,
  initialValue,
  kind,
  label,
  submitLabel,
  onSubmit,
}: Readonly<AssetModelFormProps>) {
  const initialValues = React.useMemo(
    () => normalizeValues(initialValue),
    [initialValue],
  );
  const initialValueSignature = React.useMemo(
    () => buildInitialValueSignature(initialValue, initialValues),
    [initialValue, initialValues],
  );
  const initialValuesRef = React.useRef(initialValues);
  const [values, setValues] = React.useState<FormValues>(initialValues);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [draft, setDraft] = React.useState<FileDraft | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const tokenRef = React.useRef(0);

  initialValuesRef.current = initialValues;

  React.useEffect(() => {
    const nextInitialValues = initialValuesRef.current;
    setValues(nextInitialValues);
    setSelectedFile(null);
    setDraft(null);
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
    setPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [initialValueSignature]);

  React.useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  const processFile = React.useCallback(
    async (file: File) => {
      const token = ++tokenRef.current;
      setStatus("loading");
      setProgress(0);
      setErrorMessage(null);
      setSelectedFile(file);

      try {
        const nextDraft = buildFileDraft(file, humanizeFilename(file.name));
        await readFileWithProgress(file, (nextProgress) => {
          if (tokenRef.current !== token) return;
          setProgress(nextProgress);
        });

        let width = initialValues.width;
        let height = initialValues.height;
        let length = initialValues.length;
        if (kind === "image") {
          const dimensions = await readImageDimensions(file);
          width = dimensions.width;
          height = dimensions.height;
        } else if (kind === "video") {
          const metadata = await readVideoMetadata(file);
          width = metadata.width;
          height = metadata.height;
          length = metadata.length;
        }

        if (tokenRef.current !== token) {
          return;
        }

        setDraft(nextDraft);
        setValues((previous) => ({
          ...previous,
          alt:
            previous.alt.trim().length > 0
              ? previous.alt
              : kind === "file"
                ? previous.alt
                : nextDraft.name,
          extension: nextDraft.extension,
          filename: nextDraft.filename,
          height,
          length,
          mimeType: nextDraft.mimeType,
          name:
            previous.name.trim().length > 0 ? previous.name : nextDraft.name,
          size: nextDraft.size,
          url: "",
          width,
        }));
        setPreviewUrl((existing) => {
          if (existing) {
            URL.revokeObjectURL(existing);
          }
          if (kind === "image" || kind === "video") {
            return URL.createObjectURL(file);
          }
          return null;
        });
        setStatus("ready");
      } catch {
        if (tokenRef.current !== token) {
          return;
        }
        setStatus("error");
        setErrorMessage("We could not read that file. Try another upload.");
      }
    },
    [initialValues.height, initialValues.length, initialValues.width, kind],
  );

  const onFilesSelected = React.useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file || disabled) return;
      void processFile(file);
    },
    [disabled, processFile],
  );

  const clearSelectedFile = React.useCallback(() => {
    setSelectedFile(null);
    setDraft(null);
    setStatus("idle");
    setProgress(0);
    setErrorMessage(null);
    setPreviewUrl((existing) => {
      if (existing) {
        URL.revokeObjectURL(existing);
      }
      return null;
    });
    setValues((previous) => ({
      ...previous,
      extension: initialValues.extension,
      filename: initialValues.filename,
      height: initialValues.height,
      length: initialValues.length,
      mimeType: initialValues.mimeType,
      size: initialValues.size,
      url: initialValues.url,
      width: initialValues.width,
    }));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [initialValues]);

  const onSubmitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || isSubmitting) {
      return;
    }

    const requiresNewFile = !hasInitialAsset(initialValues) && !selectedFile;
    if (requiresNewFile) {
      setErrorMessage("Select a file before creating this asset.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("name", values.name.trim());
        if (values.alt.trim().length > 0) {
          formData.append("alt", values.alt.trim());
        }
        if (values.width != null) {
          formData.append("width", String(values.width));
        }
        if (values.height != null) {
          formData.append("height", String(values.height));
        }
        if (values.length != null) {
          formData.append("length", String(values.length));
        }
        await onSubmit(formData);
      } else {
        await onSubmit({
          alt: values.alt.trim() || undefined,
          extension: values.extension || undefined,
          filename: values.filename || undefined,
          height: values.height ?? undefined,
          length: values.length ?? undefined,
          mimeType: values.mimeType || undefined,
          name: values.name.trim() || undefined,
          size: values.size ?? undefined,
          storageKey: values.storageKey || undefined,
          width: values.width ?? undefined,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const icon =
    kind === "image" ? (
      <ImageIcon className="size-5" />
    ) : kind === "video" ? (
      <Film className="size-5" />
    ) : (
      <FileIcon className="size-5" />
    );

  const previewLabel = label ?? (kind === "image" ? "Image" : kind === "video" ? "Video" : "File");
  const displayUrl = previewUrl ?? (values.url.trim() || null);
  const previewAlt =
    values.alt.trim() || values.name.trim() || values.filename.trim() || previewLabel;

  return (
    <form className="grid gap-6" data-testid="asset-model-form" onSubmit={(event) => void onSubmitForm(event)}>
      <Card>
        <CardContent className="grid gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              {icon}
              <span>{previewLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              {draft ? (
                <Badge variant="secondary">{formatBytes(draft.size)}</Badge>
              ) : values.size != null ? (
                <Badge variant="secondary">{formatBytes(values.size)}</Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-2 size-4" />
                {selectedFile || hasInitialAsset(values) ? "Replace file" : "Upload file"}
              </Button>
            </div>
          </div>

          <input
            ref={inputRef}
            accept={getAssetAccept(kind)}
            className="hidden"
            data-testid="asset-model-file-input"
            disabled={disabled}
            type="file"
            onChange={(event) => onFilesSelected(event.target.files)}
          />

          <div
            className="rounded-md border border-dashed p-4"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              onFilesSelected(event.dataTransfer.files);
            }}
          >
            {displayUrl && kind === "image" ? (
              <img
                alt={previewAlt}
                className="h-40 w-full rounded border bg-muted/20 object-contain"
                data-testid="asset-model-preview-image"
                src={displayUrl}
              />
            ) : displayUrl && kind === "video" ? (
              <video
                className="h-40 w-full rounded border bg-muted/20 object-contain"
                data-testid="asset-model-preview-video"
                muted
                playsInline
                src={displayUrl}
              />
            ) : (
              <div
                className="flex min-h-40 items-center justify-center rounded border bg-muted/30 text-muted-foreground"
                data-testid="asset-model-preview-placeholder"
              >
                {icon}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {values.filename ? <Badge variant="outline">{values.filename}</Badge> : null}
              {values.extension ? <Badge variant="outline">{values.extension.toUpperCase()}</Badge> : null}
              {values.mimeType ? <Badge variant="outline">{values.mimeType}</Badge> : null}
              {values.width != null && values.height != null ? (
                <Badge variant="outline">{values.width}×{values.height}</Badge>
              ) : null}
              {kind === "video" && values.length != null ? (
                <Badge variant="outline">{values.length}s</Badge>
              ) : null}
            </div>
            {status === "loading" ? (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-muted-foreground">Reading file… {progress}%</div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}
            {errorMessage ? (
              <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
            ) : null}
            {(selectedFile || draft) && !disabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={clearSelectedFile}
              >
                <RefreshCcw className="mr-2 size-4" />
                Revert upload
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Field>
        <FieldLabel>Name</FieldLabel>
        <FieldContent>
          <Input
            data-testid="asset-model-name-input"
            disabled={disabled}
            value={values.name}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, name: event.target.value }))
            }
          />
        </FieldContent>
      </Field>

      {kind !== "file" ? (
        <Field>
          <FieldLabel>Alt</FieldLabel>
          <FieldContent>
            <Input
              data-testid="asset-model-alt-input"
              disabled={disabled}
              value={values.alt}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, alt: event.target.value }))
              }
            />
            <FieldDescription>
              Used as descriptive text for the uploaded asset.
            </FieldDescription>
          </FieldContent>
        </Field>
      ) : null}

      <div className="flex justify-end">
        <Button
          data-testid="asset-model-submit"
          disabled={disabled || isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
