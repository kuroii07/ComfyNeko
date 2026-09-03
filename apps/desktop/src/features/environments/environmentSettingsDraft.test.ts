import { describe, expect, it } from "vitest";

import {
  applyAccelerationPreset,
  parseEnvironmentVariableDraft
} from "./environmentSettingsDraft";

describe("environment settings draft", () => {
  it("maps the balanced preset without an external side effect", () => {
    expect(applyAccelerationPreset("balanced")).toMatchObject({
      memoryStrategy: "normal",
      attention: "auto",
      precision: "auto"
    });
  });

  it("reports malformed and duplicate variable lines with their original line numbers", () => {
    expect(
      parseEnvironmentVariableDraft(
        "CUDA_VISIBLE_DEVICES=0\nBROKEN\n=bad\nCUDA_VISIBLE_DEVICES=1"
      ).errors
    ).toEqual([
      { line: 2, code: "missing-equals" },
      { line: 3, code: "empty-key" },
      { line: 4, code: "duplicate-key" }
    ]);
  });

  it("ignores comments and blank lines while preserving values that contain equals signs", () => {
    expect(
      parseEnvironmentVariableDraft(
        "# GPU choice\n\nHF_ENDPOINT=https://example.test?a=b"
      ).entries
    ).toEqual([
      {
        key: "HF_ENDPOINT",
        value: "https://example.test?a=b",
        line: 3
      }
    ]);
  });
});
