import { getAppAssetBaseUrl } from "@/lib/env";

export function getSelfHostedAssetBaseUrl(): string {
  return getAppAssetBaseUrl();
}

export function getSelfHostedAssetBasePath(): string {
  return "/assets";
}
