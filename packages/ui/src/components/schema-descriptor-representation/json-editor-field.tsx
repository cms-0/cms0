"use client";

import * as React from "react";

import { Field, FieldContent, FieldDescription, FieldLabel } from "../field";
import { Textarea } from "../textarea";

type JsonEditorFieldProps = {
  description?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: unknown) => void;
  value: unknown;
};

export function JsonEditorField({
  description,
  disabled = false,
  label,
  onChange,
  value,
}: Readonly<JsonEditorFieldProps>) {
  const [rawValue, setRawValue] = React.useState(
    JSON.stringify(value ?? null, null, 2),
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRawValue(JSON.stringify(value ?? null, null, 2));
    setError(null);
  }, [value]);

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <Textarea
          disabled={disabled}
          rows={8}
          value={rawValue}
          onChange={(event) => {
            const nextRawValue = event.target.value;
            setRawValue(nextRawValue);

            try {
              const parsed = JSON.parse(nextRawValue);
              onChange(parsed);
              setError(null);
            } catch {
              setError("Provide valid JSON before saving.");
            }
          }}
        />
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </FieldContent>
    </Field>
  );
}
