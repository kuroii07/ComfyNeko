import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentVariablesSettings } from "./EnvironmentVariablesSettings";

describe("EnvironmentVariablesSettings", () => {
  it("keeps edits in the controlled local draft and exposes matching line numbers", () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <EnvironmentVariablesSettings locale="zh-CN" value="CUDA_VISIBLE_DEVICES=0" onChange={onChange} />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "启动环境变量" }), {
      target: { value: "CUDA_VISIBLE_DEVICES=0\nHF_ENDPOINT=https://example.test" }
    });

    expect(onChange).toHaveBeenCalledWith(
      "CUDA_VISIBLE_DEVICES=0\nHF_ENDPOINT=https://example.test"
    );
    rerender(
      <EnvironmentVariablesSettings
        locale="zh-CN"
        value={"CUDA_VISIBLE_DEVICES=0\nHF_ENDPOINT=https://example.test"}
        onChange={onChange}
      />
    );
    expect(screen.getByTestId("environment-variable-line-numbers")).toHaveTextContent(
      "1"
    );
    expect(screen.getByTestId("environment-variable-line-numbers")).toHaveTextContent(
      "2"
    );
  });

  it("announces line-specific format errors without disabling draft editing", () => {
    render(
      <EnvironmentVariablesSettings
        locale="zh-CN"
        value={"CUDA_VISIBLE_DEVICES=0\nBROKEN\nCUDA_VISIBLE_DEVICES=1"}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "启动环境变量" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("第 2 行缺少等号");
    expect(screen.getByRole("alert")).toHaveTextContent("第 3 行的变量键已重复定义");
  });
});
