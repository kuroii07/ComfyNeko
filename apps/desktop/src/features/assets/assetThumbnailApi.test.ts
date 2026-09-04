import { afterEach, describe, expect, it, vi } from "vitest";

const { convertFileSrc, invoke } = vi.hoisted(() => ({
  convertFileSrc: vi.fn(),
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc,
  invoke
}));

import { tauriAssetThumbnailApi } from "./assetThumbnailApi";

describe("tauriAssetThumbnailApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });

  it("requests a thumbnail by asset id and converts only ready cache paths", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invoke.mockResolvedValue({
      asset_id: "asset-1",
      state: "ready",
      cache_path: "C:\\cache\\thumbnail.webp"
    });
    convertFileSrc.mockReturnValue(
      "http://asset.localhost/C%3A/cache/thumbnail.webp"
    );

    await expect(tauriAssetThumbnailApi.get("asset-1")).resolves.toEqual({
      assetId: "asset-1",
      state: "ready",
      sourceUrl: "http://asset.localhost/C%3A/cache/thumbnail.webp"
    });
    expect(invoke).toHaveBeenCalledWith("get_asset_thumbnail", {
      assetId: "asset-1"
    });
    expect(convertFileSrc).toHaveBeenCalledWith(
      "C:\\cache\\thumbnail.webp"
    );
  });

  it("returns an unavailable placeholder contract in browser previews", async () => {
    await expect(tauriAssetThumbnailApi.get("asset-2")).resolves.toEqual({
      assetId: "asset-2",
      state: "unavailable",
      sourceUrl: null
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("does not convert unsupported or pathless responses", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invoke.mockResolvedValue({
      asset_id: "asset-3",
      state: "unsupported",
      cache_path: null
    });

    await expect(tauriAssetThumbnailApi.get("asset-3")).resolves.toEqual({
      assetId: "asset-3",
      state: "unsupported",
      sourceUrl: null
    });
    expect(convertFileSrc).not.toHaveBeenCalled();
  });
});
