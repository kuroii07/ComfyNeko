import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("shows its text when a keyboard user focuses the icon button", () => {
    render(
      <Tooltip label="收起侧栏">
        <button aria-label="收起侧栏" type="button">
          图标
        </button>
      </Tooltip>
    );

    fireEvent.focus(screen.getByRole("button", { name: "收起侧栏" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("收起侧栏");
    expect(screen.getByRole("tooltip")).toBeVisible();
  });
});
