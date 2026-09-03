import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke, openDialog } = vi.hoisted(() => ({
  invoke: vi.fn(),
  openDialog: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openDialog
}));

import { tauriPathActionApi } from "./pathActionApi";

describe("tauriPathActionApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });

  it("uses the official Tauri dialog for directory and Python selection", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    openDialog
      .mockResolvedValueOnce("D:\\ComfyUI")
      .mockResolvedValueOnce("D:\\ComfyUI\\.venv\\Scripts\\python.exe");

    await expect(
      tauriPathActionApi.selectDirectory("D:\\ComfyUI")
    ).resolves.toBe("D:\\ComfyUI");
    await expect(
      tauriPathActionApi.selectPythonExecutable(
        "D:\\ComfyUI\\.venv\\Scripts\\python.exe"
      )
    ).resolves.toContain("python.exe");

    expect(openDialog).toHaveBeenNthCalledWith(1, {
      defaultPath: "D:\\ComfyUI",
      directory: true,
      multiple: false
    });
    expect(openDialog).toHaveBeenNthCalledWith(2, {
      defaultPath: "D:\\ComfyUI\\.venv\\Scripts\\python.exe",
      directory: false,
      filters: [{ extensions: ["exe"], name: "Python executable" }],
      multiple: false,
      title: "选择 Python 解释器"
    });
  });

  it("uses the validated Rust command for configured paths", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invoke.mockResolvedValue(undefined);

    await tauriPathActionApi.openPath("D:\\ComfyUI");

    expect(invoke).toHaveBeenCalledWith("open_path_in_explorer", {
      path: "D:\\ComfyUI"
    });
  });
});
