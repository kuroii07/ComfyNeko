import { invoke } from "@tauri-apps/api/core";

export type AssetKind = "image" | "video" | "audio" | "model" | "workflow";
export type AssetRootKind = "input" | "output" | "models" | "workflows";
export type AssetAvailability = "present" | "missing";
export type AssetSort =
  | "modified_desc"
  | "modified_asc"
  | "path_asc"
  | "path_desc"
  | "size_desc"
  | "size_asc";

export type AssetListItem = {
  id: string;
  environment_id: string;
  root_kind: AssetRootKind;
  kind: AssetKind;
  name: string;
  directory: string;
  normalized_path: string;
  size_bytes: number;
  modified_at: string | null;
  fingerprint: string | null;
  indexed_at: string;
  last_seen_at: string | null;
  availability: AssetAvailability;
  missing_since: string | null;
};

export type AssetPage = {
  items: AssetListItem[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type AssetQueryRequest = {
  environment_id: string;
  kind: AssetKind | null;
  root_kind: AssetRootKind | null;
  directory: string | null;
  availability: AssetAvailability | null;
  search: string;
  media_only: true;
  sort: AssetSort;
  page: number;
  page_size: number;
};

export type AssetQueryApi = {
  query(request: AssetQueryRequest): Promise<AssetPage>;
};

export const tauriAssetQueryApi: AssetQueryApi = {
  query(request) {
    if (!isTauriRuntime()) {
      return Promise.resolve(createEmptyAssetPage(request));
    }
    return invoke<AssetPage>("query_assets", { request });
  }
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createEmptyAssetPage(request: AssetQueryRequest): AssetPage {
  return {
    items: [],
    page: request.page,
    page_size: request.page_size,
    total_items: 0,
    total_pages: 0
  };
}
