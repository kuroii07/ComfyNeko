import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type PathActionApi = {
  openPath(path: string): Promise<void>;
  selectDirectory(initialPath?: string): Promise<string | null>;
  selectPythonExecutable(initialPath?: string): Promise<string | null>;
};

export const tauriPathActionApi: PathActionApi = {
  openPath(path) {
    if (!isTauriRuntime()) {
      return Promise.resolve();
    }
    return invoke<void>("open_path_in_explorer", { path });
  },
  selectDirectory(initialPath) {
    if (!isTauriRuntime()) {
      return Promise.resolve(null);
    }
    return open({
      defaultPath: initialPath || undefined,
      directory: true,
      multiple: false
    });
  },
  selectPythonExecutable(initialPath) {
    if (!isTauriRuntime()) {
      return Promise.resolve(null);
    }
    return open({
      defaultPath: initialPath || undefined,
      directory: false,
      filters: [{ extensions: ["exe"], name: "Python executable" }],
      multiple: false,
      title: "选择 Python 解释器"
    });
  }
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
