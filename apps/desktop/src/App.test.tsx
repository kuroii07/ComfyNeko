import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders sticky environment guidance with blocked first-step navigation", () => {
    render(<App />);

    const guidance = screen
      .getByText("确认路径诊断后保存；此操作不会修改 ComfyUI 文件。")
      .closest("header");

    expect(guidance).toHaveAttribute("data-sticky", "true");
    expect(screen.getByRole("heading", { name: "基础信息" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
  });
});
