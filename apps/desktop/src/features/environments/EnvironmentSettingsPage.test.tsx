import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentSettingsPage } from "./EnvironmentSettingsPage";
import { EnvironmentSettingsTabs } from "./EnvironmentSettingsTabs";
import { readyProfile } from "./environmentTestFixtures";

describe("EnvironmentSettingsPage", () => {
  it("renders the environment heading and four keyboard-accessible tabs", () => {
    render(
      <EnvironmentSettingsPage
        activeTab="general"
        locale="zh-CN"
        onTabChange={vi.fn()}
        profile={readyProfile}
      >
        <p>当前面板</p>
      </EnvironmentSettingsPage>
    );

    expect(
      screen.getByRole("heading", { name: "环境设置" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "环境设置分区" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "通用设置" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("当前面板")).toBeInTheDocument();
  });

  it("moves the active tab right with ArrowRight", () => {
    const onTabChange = vi.fn();

    render(
      <EnvironmentSettingsTabs
        activeTab="general"
        locale="zh-CN"
        onTabChange={onTabChange}
      />
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "通用设置" }), {
      key: "ArrowRight"
    });

    expect(onTabChange).toHaveBeenCalledWith("acceleration");
  });
});
