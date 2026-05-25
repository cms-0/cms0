"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@cms0/ui";

export default function Page() {
  const apiBaseUrl = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const base = window.location.origin;
    if (!base) return null;
    return `${base.replace(/\/$/, "")}/api/content`;
  }, []);

  const handleCopyApiBaseUrl = async () => {
    if (!apiBaseUrl) {
      toast.error("API base URL is not available.");
      return;
    }
    try {
      await navigator.clipboard.writeText(apiBaseUrl);
      toast.success("API base URL copied.");
    } catch {
      toast.error("Failed to copy.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage Instance actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instance API base URL</CardTitle>
          <CardDescription>
            Use this base URL to access the instance API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              readOnly
              value={apiBaseUrl ?? "Not configured"}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyApiBaseUrl}
              disabled={!apiBaseUrl}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Go to the{" "}
            <Link href="/settings/api-keys" className="underline">
              api keys
            </Link>{" "}
            to get an key. Backups and rollback tools are available in{" "}
            <Link href="/settings/backups" className="underline">
              backups
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
