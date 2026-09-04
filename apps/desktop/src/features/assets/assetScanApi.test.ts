import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke
}));

import { type AssetScanTask, tauriAssetScanApi } from "./assetScanApi";

const task: AssetScanTask = {
  id: "task-1",
  environment_id: "environment-1",
  status: "running",
  processed_directories: 2,
  pending_directories: 3,
  discovered_assets: 4,
  inserted_count: 1,
  updated_count: 1,
  unchanged_count: 2,
  invalidated_count: 0,
  issue_count: 0,
  current_path: "D:\\ComfyUI\\output",
  can_cancel: true,
  can_resume: false,
  created_at: "2026-09-04T08:00:00Z",
  started_at: "2026-09-04T08:00:01Z",
  updated_at: "2026-09-04T08:00:02Z",
  finished_at: null,
  error: null
};

describe("tauriAssetScanApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });

  it("maps all desktop methods to the exact Tauri commands and camelCase arguments", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invoke.mockResolvedValue(task);

    await tauriAssetScanApi.start("environment-1");
    await tauriAssetScanApi.get("task-1");
    await tauriAssetScanApi.list("environment-1");
    await tauriAssetScanApi.listIssues("task-1");
    await tauriAssetScanApi.cancel("task-1");
    await tauriAssetScanApi.resume("task-1");

    expect(invoke).toHaveBeenNthCalledWith(1, "start_asset_scan", {
      environmentId: "environment-1"
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "get_asset_scan_task", {
      taskId: "task-1"
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "list_asset_scan_tasks", {
      environmentId: "environment-1"
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "list_asset_scan_issues", {
      taskId: "task-1"
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "cancel_asset_scan", {
      taskId: "task-1"
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "resume_asset_scan", {
      taskId: "task-1"
    });
  });

  it("keeps browser preview reads empty and rejects desktop-only mutations", async () => {
    expect("__TAURI_INTERNALS__" in window).toBe(false);

    await expect(tauriAssetScanApi.list()).resolves.toEqual([]);
    await expect(tauriAssetScanApi.listIssues("task-1")).resolves.toEqual([]);
    await expect(tauriAssetScanApi.start("environment-1")).rejects.toThrow(
      "Desktop runtime required"
    );
    await expect(tauriAssetScanApi.cancel("task-1")).rejects.toThrow(
      "Desktop runtime required"
    );
    await expect(tauriAssetScanApi.resume("task-1")).rejects.toThrow(
      "Desktop runtime required"
    );
  });
});
