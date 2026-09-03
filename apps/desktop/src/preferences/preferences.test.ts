import { describe, expect, it } from "vitest";

import { readPreferences, writePreferences } from "./preferences";

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

it("persists only the versioned ComfyNeko preference payload", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };

  writePreferences(storage, {
    locale: "en-US",
    sidebarCollapsed: true,
    theme: "dark"
  });

  expect(values).toEqual(
    new Map([
      [
        "comfyneko.preferences.v1",
        JSON.stringify({
          locale: "en-US",
          sidebarCollapsed: true,
          theme: "dark"
        })
      ]
    ])
  );
});
