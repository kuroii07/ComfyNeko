import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("shows complete app preferences and product information", () => {
    const onPreferencesChange = vi.fn();

    render(
      <SettingsPage
        locale="zh-CN"
        preferences={{
          locale: "zh-CN",
          sidebarCollapsed: false,
          theme: "light"
        }}
        onPreferencesChange={onPreferencesChange}
      />
    );

    expect(screen.getByText("外观与语言")).toBeInTheDocument();
    expect(screen.getByText("界面与交互")).toBeInTheDocument();
    expect(screen.getByText("应用信息")).toBeInTheDocument();
    expect(screen.getByText("本地优先")).toBeInTheDocument();
    expect(screen.getByText("只读保护")).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    expect(onPreferencesChange).toHaveBeenCalledWith({ theme: "dark" });
  });
});
