import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("matches the VisionHub sidebar hierarchy without embedded settings forms", () => {
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
    expect(screen.getByRole("button", { name: "环境管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "偏好设置" })).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-footer")).not.toContainElement(
      screen.queryByRole("combobox")
    );
    expect(screen.getByRole("button", { name: "切换为深色模式" })).toBeInTheDocument();
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

  it("switches between environment and preference pages", () => {
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
