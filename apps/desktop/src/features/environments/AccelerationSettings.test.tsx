import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccelerationSettings } from "./AccelerationSettings";
import { applyAccelerationPreset } from "./environmentSettingsDraft";

describe("AccelerationSettings", () => {
  it("applies the selected preset to the local acceleration draft", () => {
    const onChange = vi.fn();

    render(
      <AccelerationSettings
        acceleration={applyAccelerationPreset("balanced")}
        locale="zh-CN"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "性能优先" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "performance",
        memoryStrategy: "high",
        attention: "flash",
        precision: "fp16"
      })
    );
  });

  it("marks a manually changed runtime option as a custom local draft", () => {
    const onChange = vi.fn();

    render(
      <AccelerationSettings
        acceleration={applyAccelerationPreset("balanced")}
        locale="zh-CN"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "显存策略" }), {
      target: { value: "low" }
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "custom", memoryStrategy: "low" })
    );
  });
});
