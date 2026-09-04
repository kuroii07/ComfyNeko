import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke
}));

import { tauriAssetDetailApi } from "./assetDetailApi";

describe("tauriAssetDetailApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });

  it("requests one asset detail by its UUID", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invoke.mockResolvedValue({ asset: {}, metadata: null });

    await tauriAssetDetailApi.get("asset-1");

    expect(invoke).toHaveBeenCalledWith("get_asset_detail", {
      assetId: "asset-1"
    });
  });

  it("keeps browser previews free of fabricated local metadata", async () => {
    await expect(tauriAssetDetailApi.get("asset-1")).resolves.toBeNull();
  });
});
