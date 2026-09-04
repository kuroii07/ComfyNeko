import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentSettingsPage } from "./EnvironmentSettingsPage";
import { EnvironmentSettingsTabs } from "./EnvironmentSettingsTabs";
import { readyProfile } from "./environmentTestFixtures";

describe("EnvironmentSettingsPage", () => {
  it("keeps the page heading accessible while using a compact context bar", () => {
    render(
      <EnvironmentSettingsPage
        actions={
          <>
            <button type="button">检查环境</button>
            <button type="button">保存档案</button>
          </>
        }
        activeTab="general"
        locale="zh-CN"
        onTabChange={vi.fn()}
        profile={readyProfile}
        status="pending"
      >
        <p>当前面板</p>
      </EnvironmentSettingsPage>
    );

    expect(screen.getByRole("heading", { name: "环境设置" })).toHaveClass(
      "visually-hidden"
    );
    expect(screen.getByText("公司环境")).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "环境设置分区" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("待检查");
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
