import { describe, expect, it } from "vitest";

import { tauriEnvironmentApi } from "./environmentApi";

describe("tauriEnvironmentApi", () => {
  it("returns an empty profile list in the browser preview", async () => {
    expect("__TAURI_INTERNALS__" in window).toBe(false);

    await expect(tauriEnvironmentApi.listEnvironments()).resolves.toEqual([]);
  });

  it("returns an empty discovery result in the browser preview", async () => {
    await expect(
      tauriEnvironmentApi.discoverEnvironmentPaths("D:\\ComfyUI")
    ).resolves.toEqual({
      python_executable: null,
      roots: {
        models: [],
        input: [],
        output: [],
        workflows: [],
        custom_nodes: []
      }
    });
  });
});
