import { invoke } from "@tauri-apps/api/core";

export type AssetScanStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "paused"
  | "interrupted"
  | "completed"
  | "completed_with_issues"
  | "failed";

export type AssetScanError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type AssetScanTask = {
  id: string;
  environment_id: string;
  status: AssetScanStatus;
  processed_directories: number;
  pending_directories: number;
  discovered_assets: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  invalidated_count: number;
  issue_count: number;
  current_path: string | null;
  can_cancel: boolean;
  can_resume: boolean;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  error: AssetScanError | null;
};

export type AssetScanIssue = {
  id: number;
  task_id: string;
  path: string;
  code: string;
  message: string;
  created_at: string;
};

export type AssetScanApi = {
  start(environmentId: string): Promise<AssetScanTask>;
  get(taskId: string): Promise<AssetScanTask>;
  list(environmentId?: string): Promise<AssetScanTask[]>;
  listIssues(taskId: string): Promise<AssetScanIssue[]>;
  cancel(taskId: string): Promise<AssetScanTask>;
  resume(taskId: string): Promise<AssetScanTask>;
};

export const tauriAssetScanApi: AssetScanApi = {
  start(environmentId) {
    if (!isTauriRuntime()) {
      return rejectDesktopOnly();
    }
    return invoke<AssetScanTask>("start_asset_scan", { environmentId });
  },
  get(taskId) {
    if (!isTauriRuntime()) {
      return rejectDesktopOnly();
    }
    return invoke<AssetScanTask>("get_asset_scan_task", { taskId });
  },
  list(environmentId) {
    if (!isTauriRuntime()) {
      return Promise.resolve([]);
    }
    return invoke<AssetScanTask[]>("list_asset_scan_tasks", { environmentId });
  },
  listIssues(taskId) {
    if (!isTauriRuntime()) {
      return Promise.resolve([]);
    }
    return invoke<AssetScanIssue[]>("list_asset_scan_issues", { taskId });
  },
  cancel(taskId) {
    if (!isTauriRuntime()) {
      return rejectDesktopOnly();
    }
    return invoke<AssetScanTask>("cancel_asset_scan", { taskId });
  },
  resume(taskId) {
    if (!isTauriRuntime()) {
      return rejectDesktopOnly();
    }
    return invoke<AssetScanTask>("resume_asset_scan", { taskId });
  }
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function rejectDesktopOnly<T>(): Promise<T> {
  return Promise.reject(new Error("Desktop runtime required"));
}
