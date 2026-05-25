"use client";

import { Download } from "lucide-react";

import { Button } from "@cms0/ui";

type ExportDataButtonProps = {
  className?: string;
  disabled?: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
};

export function ExportDataButton({
  className,
  disabled = false,
  size = "default",
  variant = "outline",
}: Readonly<ExportDataButtonProps>) {
  const handleDownload = () => {
    const anchor = document.createElement("a");
    anchor.href = "/api/content/data-transfer/export";
    anchor.download = "";
    anchor.click();
  };

  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={handleDownload}
      size={size}
      type="button"
      variant={variant}
    >
      <Download className="h-4 w-4" />
      Export data
    </Button>
  );
}
