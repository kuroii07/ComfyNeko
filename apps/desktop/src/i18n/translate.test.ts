import { describe, expect, it } from "vitest";

import { translate } from "./translate";

describe("translate", () => {
  it("falls back to the English message when the selected locale is missing a key", () => {
    expect(translate("zh-CN", "settings.manualUpdate")).toBe("Manual update instructions");
  });
});
