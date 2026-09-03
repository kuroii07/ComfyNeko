import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeneralEnvironmentSettings } from "./GeneralEnvironmentSettings";

describe("GeneralEnvironmentSettings", () => {
  it("places existing core-path controls in a labeled configuration panel", () => {
    render(
      <GeneralEnvironmentSettings locale="zh-CN">
        <input aria-label="ComfyUI 根目录" value="D:\\ComfyUI" readOnly />
      </GeneralEnvironmentSettings>
    );

    expect(screen.getByText("环境身份与核心路径")).toBeInTheDocument();
    expect(screen.getByText("通用设置会保存到 ComfyNeko 本地档案中。")).toBeInTheDocument();
    expect(screen.getByTestId("general-environment-config-panel")).toContainElement(
      screen.getByRole("textbox", { name: "ComfyUI 根目录" })
    );
  });
});
