"use client";

import { RichTextEditor } from "./inputs/rich-text-editor";

type RichTextEditorFieldProps = {
  disabled?: boolean;
  onChange: (value: { html: string; value: unknown }) => void;
  value: unknown;
};

export function RichTextEditorField({
  disabled = false,
  onChange,
  value,
}: Readonly<RichTextEditorFieldProps>) {
  return <RichTextEditor disabled={disabled} value={value} onChange={onChange} />;
}
