import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentManager } from "./EnvironmentManager";
import type { EnvironmentApi } from "./environmentApi";
import {
  clearProbe,
  readyProfile
} from "./environmentTestFixtures";

describe("EnvironmentManager", () => {
  it("loads persisted environments and opens the selected profile", async () => {
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([
        readyProfile,
        {
          ...readyProfile,
          id: "62adb785-8a90-4bbf-b954-7c915c97d9ee",
          name: "家里环境",
          comfy_root: "E:\\ComfyUI"
        }
      ])
    });

    render(<EnvironmentManager api={api} />);

    expect(screen.getByText("正在加载环境档案…")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /家里环境/ })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /家里环境/ }));

    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue(
      "家里环境"
    );
    expect(screen.getByRole("textbox", { name: "ComfyUI 根目录" })).toHaveValue(
      "E:\\ComfyUI"
    );
  });

  it("shows an honest empty state when no profile is stored", async () => {
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([])
    });

    render(<EnvironmentManager api={api} />);

    expect(await screen.findByText("暂无已保存环境")).toBeInTheDocument();
  });

  it("recovers from a list failure through the retry action", async () => {
    const listEnvironments = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce([readyProfile]);
    const api = createEnvironmentApi({ listEnvironments });

    render(<EnvironmentManager api={api} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "环境档案加载失败"
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(
      await screen.findByRole("button", { name: /公司环境/ })
    ).toBeInTheDocument();
  });

  it("refreshes the saved profile library after a successful save", async () => {
    const listEnvironments = vi
      .fn()
      .mockResolvedValueOnce([readyProfile])
      .mockResolvedValueOnce([
        {
          ...readyProfile,
          name: "公司环境（已刷新）"
        }
      ]);
    const api = createEnvironmentApi({ listEnvironments });

    render(<EnvironmentManager api={api} />);

    await screen.findByRole("button", { name: /公司环境/ });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存环境" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "保存环境" }));

    expect(
      await screen.findByRole("button", { name: /公司环境（已刷新）/ })
    ).toBeInTheDocument();
  });
});

function createEnvironmentApi(
  overrides: Partial<EnvironmentApi>
): EnvironmentApi {
  return {
    listEnvironments: vi.fn().mockResolvedValue([]),
    probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
    saveEnvironment: vi.fn().mockResolvedValue(clearProbe),
    ...overrides
  };
}
