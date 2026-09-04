import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvironmentManager } from "./EnvironmentManager";
import type { EnvironmentApi } from "./environmentApi";
import {
  clearProbe,
  readyProfile
} from "./environmentTestFixtures";

describe("EnvironmentManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("places the page header before the saved environment library", () => {
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([])
    });

    render(<EnvironmentManager api={api} />);

    const header = screen
      .getByRole("heading", { name: "环境设置" })
      .closest("header");
    const library = screen.getByRole("region", { name: "已保存环境" });

    expect(header).not.toBeNull();
    expect(
      Boolean(
        header!.compareDocumentPosition(library) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });

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
      await screen.findByRole("radio", { name: /家里环境/ })
    ).toBeInTheDocument();

    const homeProfileRadio = screen.getByRole("radio", { name: /家里环境/ });
    homeProfileRadio.focus();
    fireEvent.click(homeProfileRadio);

    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue(
      "家里环境"
    );
    expect(screen.getByRole("textbox", { name: "ComfyUI 根目录" })).toHaveValue(
      "E:\\ComfyUI"
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /家里环境/ })).toHaveFocus()
    );
  });

  it("uses a compact profile switch rail and starts a clean profile", async () => {
    const homeProfile = {
      ...readyProfile,
      id: "62adb785-8a90-4bbf-b954-7c915c97d9ee",
      name: "家里环境",
      comfy_root: "E:\\ComfyUI"
    };
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([readyProfile, homeProfile])
    });

    render(<EnvironmentManager api={api} />);

    const switchRail = await screen.findByRole("radiogroup", {
      name: "已保存环境"
    });
    const profileTabs = within(switchRail).getAllByRole("radio");

    expect(profileTabs).toHaveLength(2);
    expect(profileTabs[0]).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(profileTabs[0], { key: "ArrowRight" });

    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue(
      "家里环境"
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /家里环境/ })).toHaveFocus()
    );

    fireEvent.click(screen.getByRole("button", { name: "新建环境" }));

    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue("");
    expect(
      within(screen.getByRole("radiogroup", { name: "已保存环境" }))
        .getAllByRole("radio")
        .every((radio) => radio.getAttribute("aria-checked") === "false")
    ).toBe(true);
  });

  it("does not discard unsaved profile edits when a profile switch is cancelled", async () => {
    const homeProfile = {
      ...readyProfile,
      id: "62adb785-8a90-4bbf-b954-7c915c97d9ee",
      name: "家里环境",
      comfy_root: "E:\\ComfyUI"
    };
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([readyProfile, homeProfile])
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<EnvironmentManager api={api} />);

    const companyProfileRadio = await screen.findByRole("radio", {
      name: /公司环境/
    });
    fireEvent.change(screen.getByRole("textbox", { name: "环境名称" }), {
      target: { value: "UNSAVED LOCAL EDIT" }
    });

    companyProfileRadio.focus();
    fireEvent.keyDown(companyProfileRadio, { key: "ArrowRight" });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue(
      "UNSAVED LOCAL EDIT"
    );
    expect(companyProfileRadio).toHaveAttribute("aria-checked", "true");
    expect(companyProfileRadio).toHaveFocus();
  });

  it("supports wrapped arrow navigation plus Home and End", async () => {
    const homeProfile = {
      ...readyProfile,
      id: "62adb785-8a90-4bbf-b954-7c915c97d9ee",
      name: "家里环境",
      comfy_root: "E:\\ComfyUI"
    };
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([readyProfile, homeProfile])
    });

    render(<EnvironmentManager api={api} />);

    const companyRadio = await screen.findByRole("radio", {
      name: /公司环境/
    });
    fireEvent.keyDown(companyRadio, { key: "End" });
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /家里环境/ })).toHaveFocus()
    );

    fireEvent.keyDown(screen.getByRole("radio", { name: /家里环境/ }), {
      key: "Home"
    });
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /公司环境/ })).toHaveFocus()
    );

    fireEvent.keyDown(screen.getByRole("radio", { name: /公司环境/ }), {
      key: "ArrowLeft"
    });
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /家里环境/ })).toHaveFocus()
    );

    fireEvent.keyDown(screen.getByRole("radio", { name: /家里环境/ }), {
      key: "ArrowDown"
    });
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /公司环境/ })).toHaveFocus()
    );

    fireEvent.keyDown(screen.getByRole("radio", { name: /公司环境/ }), {
      key: "ArrowUp"
    });
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /家里环境/ })).toHaveFocus()
    );
  });

  it("protects session-only drafts before switching profiles", async () => {
    const homeProfile = {
      ...readyProfile,
      id: "62adb785-8a90-4bbf-b954-7c915c97d9ee",
      name: "家里环境",
      comfy_root: "E:\\ComfyUI"
    };
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([readyProfile, homeProfile])
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<EnvironmentManager api={api} />);

    const companyProfileRadio = await screen.findByRole("radio", {
      name: /公司环境/
    });
    fireEvent.click(screen.getByRole("tab", { name: "加速与架构" }));
    fireEvent.click(screen.getByRole("button", { name: "性能优先" }));
    fireEvent.click(screen.getByRole("radio", { name: /家里环境/ }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(companyProfileRadio).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "性能优先" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an honest empty state when no profile is stored", async () => {
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([])
    });

    render(<EnvironmentManager api={api} />);

    const library = screen.getByRole("region", { name: "已保存环境" });
    await within(library).findByText("暂无档案");
    expect(within(library).getByRole("status")).toHaveTextContent(
      "暂无档案"
    );
  });

  it("clears an unsaved new profile only after confirmation", async () => {
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([])
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<EnvironmentManager api={api} />);

    await screen.findByText("暂无档案");
    fireEvent.change(screen.getByRole("textbox", { name: "环境名称" }), {
      target: { value: "临时环境" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新建环境" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue("");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "新建环境" })).toHaveFocus()
    );
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
    expect(screen.getByRole("alert")).toHaveTextContent("database unavailable");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(
      await screen.findByRole("radio", { name: /公司环境/ })
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

    await screen.findByRole("radio", { name: /公司环境/ });
    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存档案" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "保存档案" }));

    expect(
      await screen.findByRole("radio", { name: /公司环境（已刷新）/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue(
      "公司环境（已刷新）"
    );
  });

  it("uses a grammatically correct profile count in English", async () => {
    const api = createEnvironmentApi({
      listEnvironments: vi.fn().mockResolvedValue([readyProfile])
    });

    render(<EnvironmentManager api={api} locale="en-US" />);

    await screen.findByRole("radio", { name: /公司环境/ });
    const library = screen.getByRole("region", { name: "Saved environments" });
    expect(library).toHaveTextContent("1 profile");
    expect(library).not.toHaveTextContent("1 environments");
  });
});

function createEnvironmentApi(
  overrides: Partial<EnvironmentApi>
): EnvironmentApi {
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
