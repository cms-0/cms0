"use client";

import * as React from "react";

export const CMS0_RICHTEXT_FLUSH_EVENT = "cms0:richtext-flush";

type AsyncHandler = () => Promise<void> | void;

type DescriptorFormWorkflowContextValue = {
  registerNestedDirtyState: (id: string, isDirty: boolean) => void;
  registerNestedFlush: (id: string, flush: AsyncHandler) => () => void;
  registerNestedSubmit: (id: string, submit: AsyncHandler) => () => void;
};

export const DescriptorFormWorkflowContext =
  React.createContext<DescriptorFormWorkflowContextValue | null>(null);

export function useDescriptorFormWorkflow() {
  return React.useContext(DescriptorFormWorkflowContext);
}

export async function dispatchRichTextFlush() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CMS0_RICHTEXT_FLUSH_EVENT));

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

