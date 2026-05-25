"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { createAdminClient } from "@cms0/admin-client";

import { Button } from "./button";

type ExportDataButtonProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  className?: string;
  disabled?: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
};

export function ExportDataButton({
  adminBaseUrl,
  adminRoutePrefix,
  className,
  disabled = false,
  size = "default",
  variant = "outline",
}: Readonly<ExportDataButtonProps>) {
  const client = React.useMemo(
    () =>
      createAdminClient({
        baseUrl: adminBaseUrl,
        routePrefix: adminRoutePrefix,
      }),
    [adminBaseUrl, adminRoutePrefix],
  );

  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={() => {
        globalThis.location.assign(client.dataTransfer.exportUrl());
      }}
      size={size}
      type="button"
      variant={variant}
    >
      <Download className="h-4 w-4" />
      Export data
    </Button>
  );
}
