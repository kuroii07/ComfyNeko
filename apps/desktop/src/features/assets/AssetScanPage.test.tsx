import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EnvironmentApi,
  EnvironmentProfile
} from "../environments/environmentApi";
import type {
  AssetListItem,
  AssetPage,
  AssetQueryApi
} from "./assetQueryApi";
import {
  type AssetScanApi,
  type AssetScanIssue,
  type AssetScanStatus,
  type AssetScanTask
} from "./assetScanApi";
import type { AssetThumbnailApi } from "./assetThumbnailApi";
import { AssetScanPage } from "./AssetScanPage";

const officeEnvironment: EnvironmentProfile = {
  id: "environment-office",
  name: "公司环境",
  comfy_root: "D:\\ComfyUI\\Office",
  python_executable: "D:\\ComfyUI\\Office\\.venv\\Scripts\\python.exe",
  api: {
    host: "127.0.0.1",
    port: 8188
  },
  roots: {
    models: ["D:\\ComfyUI\\Office\\models"],
    input: ["D:\\ComfyUI\\Office\\input"],
    output: ["D:\\ComfyUI\\Office\\output"],
    workflows: ["D:\\ComfyUI\\Office\\user\\default\\workflows"],
    custom_nodes: ["D:\\ComfyUI\\Office\\custom_nodes"]
  },
  last_validated_at: "2026-09-04T08:00:00Z"
};

const homeEnvironment: EnvironmentProfile = {
  ...officeEnvironment,
  id: "environment-home",
  name: "家里环境",
  comfy_root: "E:\\ComfyUI\\Home"
};

describe("AssetScanPage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses a compact asset-library toolbar without a visible duplicate page title", async () => {
    const queryApi = createQueryApi();

    render(
      <AssetScanPage
        assetQueryApi={queryApi}
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={createScanApi({
          list: vi.fn().mockResolvedValue([createTask("completed")])
        })}
      />
    );

    const toolbar = await screen.findByRole("toolbar", {
      name: "资产工具栏"
    });
    const scanControls = within(toolbar).getByRole("group", {
      name: "扫描控制"
    });

    expect(
      screen.getByRole("heading", { name: "资产管理" })
    ).toHaveClass("visually-hidden");
    expect(
      within(toolbar).getByRole("searchbox", { name: "搜索资产" })
    ).toHaveAttribute("placeholder", "搜索文件或路径…");
    const environmentSelector = within(scanControls).getByRole("combobox", {
      name: "扫描环境"
    });
    expect(environmentSelector).toBeRequired();
    expect(environmentSelector).toHaveValue("");
    expect(
      within(scanControls).getByRole("button", { name: "开始扫描" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "图片" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "视频" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "音频" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "模型" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "工作流" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "模型文件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "工作流程" })).not.toBeInTheDocument();
    expect(screen.queryByText("已处理目录")).not.toBeInTheDocument();
    expect(queryApi.query).not.toHaveBeenCalled();

    fireEvent.change(environmentSelector, {
      target: { value: officeEnvironment.id }
    });

    await waitFor(() =>
      expect(queryApi.query).toHaveBeenCalledWith(
        expect.objectContaining({
          environment_id: officeEnvironment.id,
          media_only: true,
          page: 1,
          page_size: 50
        })
      )
    );
  });

  it("requests thumbnails only for image cards and keeps media placeholders", async () => {
    const observers = installIntersectionObservers();
    const assets = [
      createAsset("image-asset", "image", "preview-image.png"),
      createAsset("video-asset", "video", "preview-motion.mp4"),
      createAsset("audio-asset", "audio", "soundtrack.wav")
    ];
    const thumbnailApi: AssetThumbnailApi = {
      get: vi.fn().mockResolvedValue({
        assetId: "image-asset",
        state: "ready",
        sourceUrl: "asset://preview.webp"
      })
    };

    render(
      <AssetScanPage
        assetQueryApi={createQueryApi({
          items: assets,
          page: 1,
          page_size: 50,
          total_items: assets.length,
          total_pages: 1
        })}
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={createScanApi()}
        thumbnailApi={thumbnailApi}
      />
    );

    fireEvent.change(
      await screen.findByRole("combobox", { name: "扫描环境" }),
      {
        target: { value: officeEnvironment.id }
      }
    );
    expect(await screen.findByText("preview-image.png")).toBeInTheDocument();
    expect(screen.getByText("preview-motion.mp4")).toBeInTheDocument();
    expect(screen.getByText("soundtrack.wav")).toBeInTheDocument();
    await waitFor(() => expect(observers).toHaveLength(1));

    act(() => observers[0].trigger(true));
    await waitFor(() =>
      expect(thumbnailApi.get).toHaveBeenCalledWith("image-asset")
    );

    expect(thumbnailApi.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("模型文件")).not.toBeInTheDocument();
    expect(screen.queryByText("工作流程")).not.toBeInTheDocument();
  });

  it("keeps completed scan metrics collapsed until the status control is opened", async () => {
    render(
      <AssetScanPage
        assetQueryApi={createQueryApi()}
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={createScanApi({
          list: vi.fn().mockResolvedValue([
            createTask("completed", {
              processed_directories: 37,
              discovered_assets: 96
            })
          ])
        })}
      />
    );

    fireEvent.change(
      await screen.findByRole("combobox", { name: "扫描环境" }),
      {
        target: { value: officeEnvironment.id }
      }
    );

    const statusButton = await screen.findByRole("button", {
      name: "扫描完成，查看扫描详情"
    });
    expect(screen.queryByText("已处理目录")).not.toBeInTheDocument();

    fireEvent.click(statusButton);

    expect(screen.getByText("已处理目录")).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
  });

  it("shows a short empty state and opens environment management", async () => {
    const onOpenEnvironments = vi.fn();

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([])}
        onOpenEnvironments={onOpenEnvironments}
        scanApi={createScanApi()}
      />
    );

    expect(await screen.findByText("尚未保存环境")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "前往环境管理" }));

    expect(onOpenEnvironments).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit environment selection and never auto-starts", async () => {
    const scanApi = createScanApi();

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([
          officeEnvironment,
          homeEnvironment
        ])}
        scanApi={scanApi}
      />
    );

    const selector = await screen.findByRole("combobox", {
      name: "扫描环境"
    });
    expect(selector).toBeRequired();
    expect(selector).toHaveValue("");
    expect(screen.getByRole("option", { name: "公司环境" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "家里环境" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始扫描" })).toBeDisabled();
    expect(scanApi.start).not.toHaveBeenCalled();
  });

  it("starts the selected environment exactly once", async () => {
    const pendingStart = deferred<AssetScanTask>();
    const scanApi = createScanApi({
      start: vi.fn(() => pendingStart.promise)
    });

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={scanApi}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "扫描环境" }),
      {
        target: { value: officeEnvironment.id }
      }
    );
    await waitFor(() =>
      expect(scanApi.list).toHaveBeenCalledWith(officeEnvironment.id)
    );

    const startButton = screen.getByRole("button", { name: "开始扫描" });
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(scanApi.start).toHaveBeenCalledTimes(1);
    expect(scanApi.start).toHaveBeenCalledWith(officeEnvironment.id);
    expect(startButton).toBeDisabled();

    await act(async () => {
      pendingStart.resolve(createTask("running"));
      await pendingStart.promise;
    });
  });

  it("shows the current path and stop action while a task is running", async () => {
    const runningTask = createTask("running", {
      current_path: "D:\\ComfyUI\\Office\\models\\checkpoints"
    });
    const scanApi = createScanApi({
      list: vi.fn().mockResolvedValue([runningTask])
    });

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={scanApi}
      />
    );

    fireEvent.change(
      await screen.findByRole("combobox", { name: "扫描环境" }),
      {
        target: { value: officeEnvironment.id }
      }
    );

    expect(
      await screen.findByText("D:\\ComfyUI\\Office\\models\\checkpoints")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "停止扫描" })
    ).toBeInTheDocument();
  });

  it.each<AssetScanStatus>(["paused", "interrupted"])(
    "shows a resume action for %s tasks",
    async (status) => {
      const scanApi = createScanApi({
        list: vi.fn().mockResolvedValue([createTask(status)])
      });

      render(
        <AssetScanPage
          environmentApi={createEnvironmentApi([officeEnvironment])}
          scanApi={scanApi}
        />
      );

      fireEvent.change(
        await screen.findByRole("combobox", { name: "扫描环境" }),
        {
          target: { value: officeEnvironment.id }
        }
      );

      expect(
        await screen.findByRole("button", { name: "继续扫描" })
      ).toBeInTheDocument();
    }
  );

  it("stops polling at completion and shows the final counts", async () => {
    const scanApi = createScanApi({
      list: vi.fn().mockResolvedValue([createTask("running")]),
      get: vi.fn().mockResolvedValue(
        createTask("completed", {
          processed_directories: 12,
          pending_directories: 0,
          discovered_assets: 34,
          inserted_count: 8,
          updated_count: 4,
          unchanged_count: 22,
          invalidated_count: 3
        })
      )
    });

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={scanApi}
      />
    );

    fireEvent.change(
      await screen.findByRole("combobox", { name: "扫描环境" }),
      {
        target: { value: officeEnvironment.id }
      }
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "扫描完成，查看扫描详情"
      })
    );

    expect(
      await screen.findByRole("heading", { level: 2, name: "扫描完成" })
    ).toBeInTheDocument();
    expect(screen.getByText("新增 8")).toBeInTheDocument();
    expect(screen.getByText("更新 4")).toBeInTheDocument();
    expect(screen.getByText("未变化 22")).toBeInTheDocument();
    expect(screen.getByText("失效 3")).toBeInTheDocument();

    await new Promise((resolve) => window.setTimeout(resolve, 900));
    expect(scanApi.get).toHaveBeenCalledTimes(1);
  });

  it("explains skipped missing reconciliation and lists scan issues", async () => {
    const issue: AssetScanIssue = {
      id: 1,
      task_id: "task-1",
      path: "D:\\ComfyUI\\Office\\output\\locked",
      code: "READ_DIRECTORY_FAILED",
      message: "Access is denied",
      created_at: "2026-09-04T08:00:03Z"
    };
    const scanApi = createScanApi({
      list: vi.fn().mockResolvedValue([
        createTask("completed_with_issues", {
          issue_count: 1
        })
      ]),
      listIssues: vi.fn().mockResolvedValue([issue])
    });

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([officeEnvironment])}
        scanApi={scanApi}
      />
    );

    fireEvent.change(
      await screen.findByRole("combobox", { name: "扫描环境" }),
      {
        target: { value: officeEnvironment.id }
      }
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "完成但有问题，查看扫描详情"
      })
    );

    expect(
      await screen.findByText("存在读取问题，本次未执行失效标记。")
    ).toBeInTheDocument();
    expect(await screen.findByText("Access is denied")).toBeInTheDocument();
  });

  it("shows a recoverable request error and retries the failed load", async () => {
    const listEnvironments = vi
      .fn()
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValueOnce([officeEnvironment]);

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([], { listEnvironments })}
        scanApi={createScanApi()}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "环境档案加载失败"
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(
      await screen.findByRole("combobox", { name: "扫描环境" })
    ).toBeInTheDocument();
    expect(listEnvironments).toHaveBeenCalledTimes(2);
  });

  it("polls every 800ms without overlap and ignores stale task responses", async () => {
    vi.useFakeTimers();
    const firstPoll = deferred<AssetScanTask>();
    const get = vi.fn((taskId: string) => {
      if (taskId === "task-office") {
        return firstPoll.promise;
      }
      return Promise.resolve(
        createTask("running", {
          id: "task-home",
          environment_id: homeEnvironment.id,
          current_path: "E:\\ComfyUI\\Home\\models"
        })
      );
    });
    const list = vi.fn((environmentId?: string) =>
      Promise.resolve([
        createTask("running", {
          id:
            environmentId === homeEnvironment.id
              ? "task-home"
              : "task-office",
          environment_id: environmentId ?? officeEnvironment.id,
          current_path:
            environmentId === homeEnvironment.id
              ? "E:\\ComfyUI\\Home\\input"
              : "D:\\ComfyUI\\Office\\input"
        })
      ])
    );
    const scanApi = createScanApi({ get, list });

    render(
      <AssetScanPage
        environmentApi={createEnvironmentApi([
          officeEnvironment,
          homeEnvironment
        ])}
        scanApi={scanApi}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });
    const selector = screen.getByRole("combobox", {
      name: "扫描环境"
    });
    fireEvent.change(selector, {
      target: { value: officeEnvironment.id }
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(get).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(get).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenLastCalledWith("task-office");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });
    expect(get).toHaveBeenCalledTimes(1);

    fireEvent.change(selector, {
      target: { value: homeEnvironment.id }
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("E:\\ComfyUI\\Home\\input")).toBeInTheDocument();

    await act(async () => {
      firstPoll.resolve(
        createTask("completed", {
          id: "task-office",
          current_path: "D:\\STALE\\SHOULD-NOT-RENDER"
        })
      );
      await firstPoll.promise;
    });

    expect(
      screen.queryByText("D:\\STALE\\SHOULD-NOT-RENDER")
    ).not.toBeInTheDocument();
    expect(screen.getByText("E:\\ComfyUI\\Home\\input")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith("task-home");
  });
});

function createEnvironmentApi(
  environments: EnvironmentProfile[],
  overrides: Partial<EnvironmentApi> = {}
): EnvironmentApi {
  return {
    discoverEnvironmentPaths: vi.fn(),
    listEnvironments: vi.fn().mockResolvedValue(environments),
    probeEnvironment: vi.fn(),
    saveEnvironment: vi.fn(),
    ...overrides
  };
}

function createScanApi(overrides: Partial<AssetScanApi> = {}): AssetScanApi {
  return {
    start: vi.fn().mockResolvedValue(createTask("running")),
    get: vi.fn().mockResolvedValue(createTask("running")),
    list: vi.fn().mockResolvedValue([]),
    listIssues: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(createTask("paused")),
    resume: vi.fn().mockResolvedValue(createTask("running")),
    ...overrides
  };
}

function createQueryApi(
  page: AssetPage = {
    items: [],
    page: 1,
    page_size: 50,
    total_items: 0,
    total_pages: 0
  }
): AssetQueryApi {
  return {
    query: vi.fn().mockResolvedValue(page)
  };
}

function createAsset(
  id: string,
  kind: AssetListItem["kind"],
  name: string
): AssetListItem {
  const extension = name.split(".").at(-1) ?? "bin";

  return {
    id,
    environment_id: officeEnvironment.id,
    root_kind: "output",
    kind,
    name,
    directory: officeEnvironment.roots.output[0],
    normalized_path: `${officeEnvironment.roots.output[0]}\\${name}`,
    size_bytes: extension === "wav" ? 4_096 : 2_048,
    modified_at: "2026-09-04T10:00:00Z",
    fingerprint: null,
    indexed_at: "2026-09-04T10:00:01Z",
    last_seen_at: "2026-09-04T10:00:01Z",
    availability: "present",
    missing_since: null
  };
}

function createTask(
  status: AssetScanStatus,
  overrides: Partial<AssetScanTask> = {}
): AssetScanTask {
  return {
    id: "task-1",
    environment_id: officeEnvironment.id,
    status,
    processed_directories: 2,
    pending_directories: 3,
    discovered_assets: 4,
    inserted_count: 1,
    updated_count: 1,
    unchanged_count: 2,
    invalidated_count: 0,
    issue_count: 0,
    current_path: null,
    can_cancel: ["queued", "running", "cancelling"].includes(status),
    can_resume: ["paused", "interrupted"].includes(status),
    created_at: "2026-09-04T08:00:00Z",
    started_at: "2026-09-04T08:00:01Z",
    updated_at: "2026-09-04T08:00:02Z",
    finished_at: status.startsWith("completed")
      ? "2026-09-04T08:00:03Z"
      : null,
    error: null,
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function installIntersectionObservers() {
  const observers: Array<{ trigger(isIntersecting: boolean): void }> = [];

  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((callback: IntersectionObserverCallback) => {
      const observer = {
        trigger(isIntersecting: boolean) {
          callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            observer as unknown as IntersectionObserver
          );
        }
      };
      observers.push(observer);
      return {
        disconnect: vi.fn(),
        observe: vi.fn(),
        root: null,
        rootMargin: "160px",
        takeRecords: () => [],
        thresholds: [0],
        unobserve: vi.fn()
      };
    })
  );

  return observers;
}
