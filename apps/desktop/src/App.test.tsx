import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders sticky environment guidance with a blocked save action", () => {
    render(<App />);

    const guidance = screen
      .getByText("确认路径诊断后保存；此操作不会修改 ComfyUI 文件。")
      .closest("header");

    expect(guidance).toHaveAttribute("data-sticky", "true");
    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();
  });
});
