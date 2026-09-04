import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type AssetPreviewState = "ready" | "unsupported" | "unavailable";

export type AssetPreviewView = {
  assetId: string;
  state: AssetPreviewState;
  sourceUrl: string | null;
};

export type AssetPreviewApi = {
  get(assetId: string): Promise<AssetPreviewView>;
};

type AssetPreviewResponse = {
  asset_id: string;
  state: AssetPreviewState;
  cache_path: string | null;
};

export async function getAssetPreview(assetId: string): Promise<AssetPreviewView> {
  if (!(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)) {
    return { assetId, state: "unavailable", sourceUrl: null };
  }
  const response = await invoke<AssetPreviewResponse>("get_asset_preview", { assetId });
  return {
    assetId: response.asset_id,
    state: response.state,
    sourceUrl:
      response.state === "ready" && response.cache_path ? convertFileSrc(response.cache_path) : null
  };
}

export const tauriAssetPreviewApi: AssetPreviewApi = {
  get: getAssetPreview
};
