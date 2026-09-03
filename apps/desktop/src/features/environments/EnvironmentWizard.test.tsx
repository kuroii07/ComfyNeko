import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EnvironmentWizard } from "./EnvironmentWizard";

const blockingProbe = {
  diagnostics: [
    {
      code: "PYTHON_NOT_FOUND",
      message: "未找到 Python 解释器",
      severity: "blocking"
    }
  ]
} as const;

describe("EnvironmentWizard", () => {
  it("disables save while a blocking diagnostic exists", () => {
    render(<EnvironmentWizard initialProbe={blockingProbe} />);

    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();
  });
});
