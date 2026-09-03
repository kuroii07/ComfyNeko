import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentWizard } from "./EnvironmentWizard";
import type { ProbeResult } from "./environmentApi";
import {
  blockingProbe,
  clearProbe,
  readyProfile
} from "./environmentTestFixtures";

describe("EnvironmentWizard", () => {
  it("renders one settings-style editor without steps or a status dashboard", () => {
    render(<EnvironmentWizard initialProfile={readyProfile} />);

    expect(screen.getByText("基础配置")).toBeInTheDocument();
    expect(screen.getByText("运行环境")).toBeInTheDocument();
    expect(screen.getByText("资产目录")).toBeInTheDocument();
    expect(screen.getByText("诊断与保存")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "环境绑定步骤" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("environment-status-rail")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue("公司环境");
    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveAttribute(
      "placeholder",
      "例如：公司环境"
    );
    expect(screen.getByRole("textbox", { name: "ComfyUI 根目录" })).toHaveAttribute(
      "placeholder",
      "D:\\ComfyUI"
    );
  });

  it("disables save while a blocking diagnostic exists", () => {
    render(
      <EnvironmentWizard
        initialProbe={blockingProbe}
        initialProfile={readyProfile}
      />
    );

    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();
  });

  it("probes and saves from the same page", async () => {
    const api = createApi({
      probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
      saveEnvironment: vi.fn().mockResolvedValue(clearProbe)
    });

    render(<EnvironmentWizard api={api} initialProfile={readyProfile} />);

    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
    await waitFor(() => expect(api.probeEnvironment).toHaveBeenCalledWith(readyProfile));
    expect(screen.getByRole("button", { name: "保存环境" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "保存环境" }));
    await waitFor(() => expect(api.saveEnvironment).toHaveBeenCalledWith(readyProfile));
    expect(screen.getByText("环境已保存")).toBeInTheDocument();
  });

  it("locks duplicate actions while a probe is pending", async () => {
    let resolveProbe!: (value: ProbeResult) => void;
    const pendingProbe = new Promise<ProbeResult>((resolve) => {
      resolveProbe = resolve;
    });
    const api = createApi({
      probeEnvironment: vi.fn().mockReturnValue(pendingProbe),
      saveEnvironment: vi.fn()
    });

    render(<EnvironmentWizard api={api} initialProfile={readyProfile} />);
    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));

    expect(screen.getByRole("button", { name: "检查中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();

    resolveProbe(clearProbe);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存环境" })).toBeEnabled()
    );
  });

  it("automatically discovers conventional paths after the ComfyUI root is entered", async () => {
    const api = createApi({
      discoverEnvironmentPaths: vi.fn().mockResolvedValue({
        python_executable:
          "C:\\ComfyNekoFixtures\\ComfyUI\\.venv\\Scripts\\python.exe",
        roots: {
          models: ["C:\\ComfyNekoFixtures\\ComfyUI\\models"],
          input: ["C:\\ComfyNekoFixtures\\ComfyUI\\input"],
          output: ["C:\\ComfyNekoFixtures\\ComfyUI\\output"],
          workflows: [
            "C:\\ComfyNekoFixtures\\ComfyUI\\user\\default\\workflows"
          ],
          custom_nodes: [
            "C:\\ComfyNekoFixtures\\ComfyUI\\custom_nodes"
          ]
        }
      })
    });

    render(<EnvironmentWizard api={api} />);

    const root = screen.getByRole("textbox", { name: "ComfyUI 根目录" });
    fireEvent.change(root, {
      target: {
        value: "C:\\ComfyNekoFixtures\\ComfyUI"
      }
    });
    fireEvent.blur(root);

    await waitFor(() =>
      expect(api.discoverEnvironmentPaths).toHaveBeenCalledWith(
        "C:\\ComfyNekoFixtures\\ComfyUI"
      )
    );
    expect(screen.getByRole("textbox", { name: "Python 解释器" })).toHaveValue(
      "C:\\ComfyNekoFixtures\\ComfyUI\\.venv\\Scripts\\python.exe"
    );
    expect(screen.getByRole("textbox", { name: "模型目录" })).toHaveValue(
      "C:\\ComfyNekoFixtures\\ComfyUI\\models"
    );
    expect(screen.getByText("已自动识别 6 项路径")).toBeInTheDocument();
  });

  it("keeps manually customized paths when automatic discovery runs again", async () => {
    const api = createApi({
      discoverEnvironmentPaths: vi.fn().mockResolvedValue({
        python_executable: "D:\\Auto\\python.exe",
        roots: {
          models: ["D:\\Auto\\models"],
          input: ["D:\\Auto\\input"],
          output: ["D:\\Auto\\output"],
          workflows: ["D:\\Auto\\workflows"],
          custom_nodes: ["D:\\Auto\\custom_nodes"]
        }
      })
    });

    render(<EnvironmentWizard api={api} />);

    fireEvent.change(screen.getByRole("textbox", { name: "模型目录" }), {
      target: { value: "E:\\My Models" }
    });
    const root = screen.getByRole("textbox", { name: "ComfyUI 根目录" });
    fireEvent.change(root, { target: { value: "D:\\ComfyUI" } });
    fireEvent.blur(root);

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Python 解释器" })).toHaveValue(
        "D:\\Auto\\python.exe"
      )
    );
    expect(screen.getByRole("textbox", { name: "模型目录" })).toHaveValue(
      "E:\\My Models"
    );
  });

  it("uses equal single-line controls for every editable path", () => {
    render(<EnvironmentWizard initialProfile={readyProfile} />);

    for (const label of [
      "ComfyUI 根目录",
      "Python 解释器",
      "模型目录",
      "输入目录",
      "输出目录",
      "工作流目录",
      "自定义节点目录"
    ]) {
      expect(screen.getByRole("textbox", { name: label }).tagName).toBe("INPUT");
    }
  });

  it("provides matching select-path and open actions for every path field", () => {
    render(<EnvironmentWizard initialProfile={readyProfile} />);

    expect(
      screen.getAllByRole("button", { name: /^选择/ })
    ).toHaveLength(7);
    expect(
      screen.getAllByRole("button", { name: /^打开/ })
    ).toHaveLength(7);
  });

  it("selects folders and Python through native path actions, then opens them", async () => {
    const api = createApi();
    const pathApi = {
      openPath: vi.fn().mockResolvedValue(undefined),
      selectDirectory: vi.fn().mockResolvedValue("E:\\ComfyUI"),
      selectPythonExecutable: vi
        .fn()
        .mockResolvedValue("E:\\ComfyUI\\.venv\\Scripts\\python.exe")
    };

    render(
      <EnvironmentWizard
        api={api}
        initialProfile={readyProfile}
        pathApi={pathApi}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "选择路径 ComfyUI 根目录" })
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "ComfyUI 根目录" })).toHaveValue(
        "E:\\ComfyUI"
      )
    );
    expect(pathApi.selectDirectory).toHaveBeenCalledWith("D:\\ComfyUI");
    expect(api.discoverEnvironmentPaths).toHaveBeenCalledWith("E:\\ComfyUI");

    fireEvent.click(
      screen.getByRole("button", { name: "选择路径 Python 解释器" })
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Python 解释器" })).toHaveValue(
        "E:\\ComfyUI\\.venv\\Scripts\\python.exe"
      )
    );

    fireEvent.click(
      screen.getByRole("button", { name: "打开 Python 解释器" })
    );
    await waitFor(() =>
      expect(pathApi.openPath).toHaveBeenCalledWith(
        "E:\\ComfyUI\\.venv\\Scripts\\python.exe"
      )
    );
  });

  it("shows immediate progress and prevents repeated path actions", async () => {
    let resolveSelection!: (value: string | null) => void;
    const pendingSelection = new Promise<string | null>((resolve) => {
      resolveSelection = resolve;
    });
    const pathApi = {
      openPath: vi.fn().mockResolvedValue(undefined),
      selectDirectory: vi.fn().mockReturnValue(pendingSelection),
      selectPythonExecutable: vi.fn().mockResolvedValue(null)
    };

    render(
      <EnvironmentWizard
        initialProfile={readyProfile}
        pathApi={pathApi}
      />
    );

    const selectButton = screen.getByRole("button", {
      name: "选择路径 ComfyUI 根目录"
    });
    fireEvent.click(selectButton);
    fireEvent.click(selectButton);

    expect(
      screen.getByRole("button", { name: "正在选择 ComfyUI 根目录" })
    ).toBeDisabled();
    expect(pathApi.selectDirectory).toHaveBeenCalledTimes(1);

    resolveSelection(null);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "选择路径 ComfyUI 根目录" })
      ).toBeEnabled()
    );
  });
});

function createApi(overrides = {}) {
  return {
    discoverEnvironmentPaths: vi.fn().mockResolvedValue({
      python_executable: null,
      roots: {
        models: [],
        input: [],
        output: [],
        workflows: [],
        custom_nodes: []
      }
    }),
    listEnvironments: vi.fn().mockResolvedValue([]),
    probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
    saveEnvironment: vi.fn().mockResolvedValue(clearProbe),
    ...overrides
  };
}
