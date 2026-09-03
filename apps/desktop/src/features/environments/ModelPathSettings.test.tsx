import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModelPathSettings } from "./ModelPathSettings";

describe("ModelPathSettings", () => {
  it("updates only the controlled checkpoint mapping draft", () => {
    const onCategoryChange = vi.fn();

    render(
      <ModelPathSettings
        categories={{}}
        locale="zh-CN"
        onCategoryChange={onCategoryChange}
      >
        <input aria-label="模型目录" value="D:\\ComfyUI\\models" readOnly />
      </ModelPathSettings>
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Checkpoint 路径" }), {
      target: { value: "E:\\Models\\checkpoints" }
    });

    expect(onCategoryChange).toHaveBeenCalledWith(
      "checkpoints",
      "E:\\Models\\checkpoints"
    );
    expect(screen.getByTestId("model-path-config-panel")).toContainElement(
      screen.getByRole("textbox", { name: "模型目录" })
    );
  });
});
