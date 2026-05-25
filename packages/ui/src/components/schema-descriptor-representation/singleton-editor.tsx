"use client";

import type { AdminContentResponse } from "@cms0/admin-contract";

import { DescriptorValueForm } from "./descriptor-value-form";

type SingletonEditorProps = {
  canUpdate: boolean;
  initialResponse: AdminContentResponse;
  onSubmit: (value: unknown) => Promise<void>;
  pending: boolean;
};

export function SingletonEditor({
  canUpdate,
  initialResponse,
  onSubmit,
  pending,
}: Readonly<SingletonEditorProps>) {
  const defaultValueLabel =
    initialResponse.resource.kind === "object" ? "" : "Value";

  return (
    <DescriptorValueForm
      descriptor={initialResponse.resource.editorDescriptor}
      initialValue={initialResponse.value}
      pathSegments={initialResponse.resource.segments}
      submitDisabled={!canUpdate || pending}
      submitDisabledMessage={
        canUpdate ? undefined : "Your current role cannot update this content."
      }
      submitLabel={pending ? "Updating..." : "Update"}
      valueLabel={defaultValueLabel}
      onSubmit={onSubmit}
    />
  );
}
