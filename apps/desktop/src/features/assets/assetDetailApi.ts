import { invoke } from "@tauri-apps/api/core";

import type { AssetListItem } from "./assetQueryApi";

export type AssetMetadataSource = "png_metadata";
export type AssetDetailMetadataState =
  | "available"
  | "empty"
  | "invalid"
  | "unsupported"
  | "unavailable";

export type AssetDetailMetadata = {
  state: AssetDetailMetadataState;
  source: AssetMetadataSource | null;
  prompt_text: string | null;
  workflow_text: string | null;
  parsed_at: string | null;
};

export type AssetDetail = {
  asset: AssetListItem;
  metadata: AssetDetailMetadata | null;
};

export type AssetDetailApi = {
  get(assetId: string): Promise<AssetDetail | null>;
};

export const tauriAssetDetailApi: AssetDetailApi = {
  get(assetId) {
    if (!isTauriRuntime()) {
      return Promise.resolve(null);
    }
    return invoke<AssetDetail>("get_asset_detail", { assetId });
  }
};

export type AssetDetailLoadState = "unselected" | "loading" | "ready" | "error";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
