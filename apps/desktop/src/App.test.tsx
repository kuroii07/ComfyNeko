import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders a focused environment settings page instead of a dashboard", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "环境设置" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本页说明" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "键盘操作" })).toBeInTheDocument();
    expect(screen.getByText("环境档案")).toBeInTheDocument();
    expect(screen.getByText("ENVIRONMENT CONTROL")).toBeInTheDocument();
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
});
