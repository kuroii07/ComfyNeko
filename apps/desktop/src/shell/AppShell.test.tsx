import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("keeps product identity and footer controls in the expanded desktop shell", () => {
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

    expect(screen.getByText("ComfyNeko")).toBeInTheDocument();
    expect(screen.getByText("ComfyUI 资产中枢")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-footer")).toContainElement(
      screen.getByRole("combobox", { name: "外观主题" })
    );
  });

  it("persists a collapsed sidebar and applies the selected dark theme", () => {
    window.localStorage.clear();

    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "dark"
        }}
      >
        <p>内容</p>
      </AppShell>
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

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

  it("switches the navigation language without restarting", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "system"
        }}
      >
        <p>内容</p>
      </AppShell>
    );

    fireEvent.change(screen.getByRole("combobox", { name: "语言" }), {
      target: { value: "en-US" }
    });

    expect(document.documentElement).toHaveAttribute("lang", "en-US");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("switches the page theme from the appearance control", () => {
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

    fireEvent.change(screen.getByRole("combobox", { name: "外观主题" }), {
      target: { value: "dark" }
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("passes the active locale into application content", () => {
    render(
      <AppShell
        initialPreferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "system"
        }}
      >
        {(locale) => <p>{locale}</p>}
      </AppShell>
    );

    fireEvent.change(screen.getByRole("combobox", { name: "语言" }), {
      target: { value: "en-US" }
    });

    expect(screen.getByText("en-US")).toBeInTheDocument();
  });
});
