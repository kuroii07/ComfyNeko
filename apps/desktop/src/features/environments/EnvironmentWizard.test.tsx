import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentWizard } from "./EnvironmentWizard";
import type { ProbeResult } from "./environmentApi";

const readyProfile = {
  id: "6e6e8b4f-2f56-4ab6-98a6-8fefc82d61bd",
  name: "公司环境",
  comfy_root: "D:\\ComfyUI",
  python_executable: "D:\\ComfyUI\\.venv\\Scripts\\python.exe",
  api: {
    host: "127.0.0.1",
    port: 8188
  },
  roots: {
    models: [],
    input: [],
    output: [],
    workflows: [],
    custom_nodes: []
  },
  last_validated_at: null
};

const blockingProbe: ProbeResult = {
  normalized_comfy_root: null,
  diagnostics: [
    {
      code: "PYTHON_NOT_FOUND",
      message: "未找到 Python 解释器",
      severity: "blocking"
    }
  ],
  python: null,
  api: null
};

describe("EnvironmentWizard", () => {
  it("disables save while a blocking diagnostic exists", () => {
    render(
      <EnvironmentWizard
        initialProbe={blockingProbe}
        initialProfile={readyProfile}
        initialStep={4}
      />
    );

    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();
  });

  it("walks through four steps, probes, and saves a valid profile", async () => {
    const clearProbe = {
      normalized_comfy_root: "D:\\ComfyUI",
      diagnostics: [],
      python: null,
      api: null
    };
    const api = {
      listEnvironments: vi.fn().mockResolvedValue([]),
      probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
      saveEnvironment: vi.fn().mockResolvedValue(clearProbe)
    };

    render(<EnvironmentWizard api={api} initialProfile={readyProfile} />);

    expect(screen.getByRole("heading", { name: "基础信息" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "Python 与 API" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "目录映射" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "检查并保存" })).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "保存环境" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
    await waitFor(() => expect(api.probeEnvironment).toHaveBeenCalledWith(readyProfile));
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    await waitFor(() => expect(api.saveEnvironment).toHaveBeenCalledWith(readyProfile));
    expect(screen.getByRole("status")).toHaveTextContent("环境已保存");
  });
});
