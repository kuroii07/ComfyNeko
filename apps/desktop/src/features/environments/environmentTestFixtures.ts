import type { EnvironmentProfile, ProbeResult } from "./environmentApi";

export const readyProfile: EnvironmentProfile = {
  id: "6e6e8b4f-2f56-4ab6-98a6-8fefc82d61bd",
  name: "公司环境",
  comfy_root: "D:\\ComfyUI",
  python_executable: "D:\\ComfyUI\\.venv\\Scripts\\python.exe",
  api: {
    host: "127.0.0.1",
    port: 8188
  },
  roots: {
    models: [],
    input: [],
    output: [],
    workflows: [],
    custom_nodes: []
  },
  last_validated_at: null
};

export const clearProbe: ProbeResult = {
  normalized_comfy_root: "D:\\ComfyUI",
  diagnostics: [],
  python: null,
  api: null
};

export const blockingProbe: ProbeResult = {
  normalized_comfy_root: null,
  diagnostics: [
    {
      code: "PYTHON_NOT_FOUND",
      message: "未找到 Python 解释器",
      severity: "blocking"
    }
  ],
  python: null,
  api: null
};
