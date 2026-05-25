"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "./button";

type ApiKeyListActionsProps = {
  adminBaseUrl: string;
  canDelete?: boolean;
  canUpdate?: boolean;
  detailHref: string;
  keyId: string;
  onRevokedSuccess?: () => void;
};

export function ApiKeyListActions({
  adminBaseUrl,
  canDelete = true,
  canUpdate = true,
  detailHref,
  keyId,
  onRevokedSuccess,
}: Readonly<ApiKeyListActionsProps>) {
  const revokeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${adminBaseUrl}/api-keys/${keyId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as
        | { error?: string }
        | { key: unknown };

      if (!response.ok || !("key" in payload)) {
        const responseError = "error" in payload ? payload.error : undefined;
        throw new Error(responseError ?? "Unable to revoke API key.");
      }
    },
    onSuccess: () => {
      toast.success("API key revoked.");
      onRevokedSuccess?.();
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Failed to revoke API key.";
      toast.error(message);
    },
  });

  const isRevoking = revokeMutation.isPending;

  return (
    <div className="flex items-center justify-end gap-2">
      {canUpdate ? (
        <Button asChild size="sm" variant="outline">
          <a href={detailHref}>Edit</a>
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            if (window.confirm("Revoke this API key? This cannot be undone.")) {
              revokeMutation.mutate();
            }
          }}
          disabled={isRevoking}
        >
          {isRevoking ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 />
          )}
          Revoke
        </Button>
      ) : null}
    </div>
  );
}
