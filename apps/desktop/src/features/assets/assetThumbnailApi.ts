import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type ThumbnailState = "ready" | "unsupported" | "unavailable";

export type AssetThumbnailView = {
  assetId: string;
  state: ThumbnailState;
  sourceUrl: string | null;
};

export type AssetThumbnailApi = {
  get(assetId: string): Promise<AssetThumbnailView>;
};

type AssetThumbnailResponse = {
  asset_id: string;
  state: ThumbnailState;
  cache_path: string | null;
};

export const tauriAssetThumbnailApi: AssetThumbnailApi = {
  async get(assetId) {
    if (!isTauriRuntime()) {
      return {
        assetId,
        state: "unavailable",
        sourceUrl: null
      };
    }

    const response = await invoke<AssetThumbnailResponse>(
      "get_asset_thumbnail",
      { assetId }
    );

    return {
      assetId: response.asset_id,
      state: response.state,
      sourceUrl:
        response.state === "ready" && response.cache_path
          ? convertFileSrc(response.cache_path)
          : null
    };
  }
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
