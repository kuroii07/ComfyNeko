import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("reveals concise page and keyboard guidance from compact icon actions", () => {
    render(
      <PageHeader
        description="页面说明"
        help="本页帮助"
        keyboardHelp="Tab 切换焦点"
        locale="zh-CN"
        title="环境管理"
      />
    );

    expect(
      screen.getByRole("heading", { name: "环境管理" })
    ).toHaveClass("visually-hidden");
    expect(screen.getByText("页面说明")).toHaveClass("visually-hidden");

    fireEvent.click(screen.getByRole("button", { name: "本页说明" }));
    expect(screen.getByText("本页帮助")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "键盘操作" }));
    expect(screen.getByText("Tab 切换焦点")).toBeInTheDocument();
  });
});
