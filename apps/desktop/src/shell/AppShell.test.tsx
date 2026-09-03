import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the complete four-character product navigation", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "light"
        }}
      >
        {({ page }) => <p>{page}</p>}
      </AppShell>
    );

    expect(screen.getByText("ComfyNeko")).toBeInTheDocument();
    expect(screen.getByText("ComfyUI 资产管理器")).toBeInTheDocument();
    const primaryNavigation = screen.getByRole("navigation", { name: "主导航" });
    expect(
      within(primaryNavigation)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "首页总览",
      "模型管理",
      "资产管理",
      "工作流库",
      "提示词库",
      "节点管理"
    ]);
  });

  it("keeps environment management and preferences in the utility area", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "light"
        }}
      >
        {({ page }) => <p>{page}</p>}
      </AppShell>
    );

    const utilityNavigation = screen.getByRole("navigation", { name: "辅助导航" });
    expect(
      within(utilityNavigation)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["环境管理", "偏好设置"]);
    expect(screen.getByTestId("sidebar-footer")).not.toContainElement(
      screen.queryByRole("combobox")
    );
    expect(screen.getByRole("button", { name: "切换为深色模式" })).toBeInTheDocument();
  });

  it("uses compact English labels that fit the fixed sidebar width", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "en-US",
          sidebarCollapsed: false,
          theme: "light"
        }}
      >
        {({ page }) => <p>{page}</p>}
      </AppShell>
    );

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation"
    });
    expect(
      within(primaryNavigation)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Overview", "Models", "Assets", "Workflows", "Prompts", "Nodes"]);

    const utilityNavigation = screen.getByRole("navigation", {
      name: "Utility navigation"
    });
    expect(
      within(utilityNavigation)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Environments", "Preferences"]);
  });

  it("uses an icon rail when collapsed and persists the state", () => {
    window.localStorage.clear();

    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "light"
        }}
      >
        {({ page }) => <p>{page}</p>}
      </AppShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));

    expect(screen.getByRole("navigation", { name: "主导航" })).toHaveAttribute(
      "data-collapsed",
      "true"
    );
    expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
    expect(window.localStorage.getItem("comfyneko.preferences.v1")).toContain(
      '"sidebarCollapsed":true'
    );
  });

  it("switches between product and utility pages", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "light"
        }}
      >
        {({ page }) => <p data-testid="active-page">{page}</p>}
      </AppShell>
    );

    expect(screen.getByTestId("active-page")).toHaveTextContent("environments");
    fireEvent.click(screen.getByRole("button", { name: "模型管理" }));
    expect(screen.getByTestId("active-page")).toHaveTextContent("models");
    fireEvent.click(screen.getByRole("button", { name: "环境管理" }));
    expect(screen.getByTestId("active-page")).toHaveTextContent("environments");
    fireEvent.click(screen.getByRole("button", { name: "偏好设置" }));
    expect(screen.getByTestId("active-page")).toHaveTextContent("settings");
  });

  it("toggles the page theme from the compact footer action", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "light"
        }}
      >
        <p>内容</p>
      </AppShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "切换为深色模式" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
