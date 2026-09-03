import { describe, expect, it } from "vitest";

import { readPreferences } from "./preferences";

describe("readPreferences", () => {
  it("falls back to safe defaults when persisted preferences are malformed", () => {
    const storage = {
      getItem: () => "not-json"
    };

    expect(readPreferences(storage)).toMatchObject({
      locale: "zh-CN",
      sidebarCollapsed: false,
      theme: "system"
    });
  });
});
