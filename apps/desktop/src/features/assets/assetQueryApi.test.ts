import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke
}));

import { tauriAssetQueryApi } from "./assetQueryApi";

describe("tauriAssetQueryApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });

  it("passes one bounded query object to the asset query command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invoke.mockResolvedValue({
      items: [],
      page: 1,
      page_size: 50,
      total_items: 0,
      total_pages: 0
    });

    const request = {
      environment_id: "environment-1",
      kind: "image" as const,
      root_kind: "output" as const,
      directory: null,
      availability: "present" as const,
      search: "portrait",
      media_only: true as const,
      page: 1,
      page_size: 50
    };

    await tauriAssetQueryApi.query(request);

    expect(invoke).toHaveBeenCalledWith("query_assets", { request });
  });

  it("returns a stable empty page in browser previews", async () => {
    await expect(
      tauriAssetQueryApi.query({
        environment_id: "environment-1",
        kind: null,
        root_kind: null,
        directory: null,
        availability: "present",
        search: "",
        media_only: true,
        page: 1,
        page_size: 50
      })
    ).resolves.toEqual({
      items: [],
      page: 1,
      page_size: 50,
      total_items: 0,
      total_pages: 0
    });
  });
});
