import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a focused environment settings page instead of a dashboard", () => {
    render(<App />);

    expect(
      screen.getAllByRole("heading", { name: "环境设置" })
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "环境设置" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "本页说明" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "键盘操作" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("环境档案")).toBeInTheDocument();
    expect(screen.queryByText("ENVIRONMENT CONTROL")).not.toBeInTheDocument();
    expect(screen.queryByTestId("environment-status-rail")).not.toBeInTheDocument();
  });

  it("opens the preferences page from the sidebar", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "偏好设置" }));

    expect(screen.getByRole("heading", { name: "偏好设置" })).toBeInTheDocument();
    expect(screen.getByText("外观与语言")).toBeInTheDocument();
    expect(screen.getByText("应用信息")).toBeInTheDocument();
    expect(screen.getByText("本地优先")).toBeInTheDocument();
  });

  it("shows an honest planned state for unfinished feature pages", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "模型管理" }));

    expect(screen.getByRole("heading", { name: "模型管理" })).toBeInTheDocument();
    expect(screen.getByText("功能规划中")).toBeInTheDocument();
    expect(
      screen.getByText("当前仅建立导航入口，具体功能将在后续阶段开发。")
    ).toBeInTheDocument();
  });

  it("opens the real asset scan page instead of a planned placeholder", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "资产管理" }));

    expect(
      await screen.findByRole("heading", { name: "资产管理" })
    ).toBeInTheDocument();
    expect(screen.getByText("尚未保存环境")).toBeInTheDocument();
    expect(screen.queryByText("功能规划中")).not.toBeInTheDocument();
  });

  it("does not leave environment management while unsaved changes are kept", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "环境名称" }), {
      target: { value: "未保存环境" }
    });
    fireEvent.click(screen.getByRole("button", { name: "模型管理" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("heading", { level: 1, name: "环境设置" })
    ).toBeInTheDocument();
    expect(screen.queryByText("功能规划中")).not.toBeInTheDocument();
  });

  it("leaves after confirmation and clears the navigation guard", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "环境名称" }), {
      target: { value: "可放弃的环境草稿" }
    });
    fireEvent.click(screen.getByRole("button", { name: "模型管理" }));

    expect(await screen.findByRole("heading", { name: "模型管理" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "资产管理" }));
    expect(screen.getByRole("heading", { name: "资产管理" })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
