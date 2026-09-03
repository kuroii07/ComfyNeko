import { invoke } from "@tauri-apps/api/core";

export type ProbeDiagnostic = {
  code: string;
  message: string;
  severity: "info" | "warning" | "blocking";
  evidence?: string | null;
};

export type EnvironmentRoots = {
  models: string[];
  input: string[];
  output: string[];
  workflows: string[];
  custom_nodes: string[];
};

export type EnvironmentProfile = {
  id: string;
  name: string;
  comfy_root: string;
  python_executable: string | null;
  api: {
    host: string;
    port: number;
  } | null;
  roots: EnvironmentRoots;
  last_validated_at: string | null;
};

export type EnvironmentPathDiscovery = {
  python_executable: string | null;
  roots: EnvironmentRoots;
};

export type ProbeResult = {
  normalized_comfy_root: string | null;
  diagnostics: ProbeDiagnostic[];
  python: {
    executable: string;
    version: string;
    import_status: "available" | "missing";
  } | null;
  api: {
    reachable: boolean;
    comfy_version: string | null;
  } | null;
};

export type EnvironmentApi = {
  discoverEnvironmentPaths(comfyRoot: string): Promise<EnvironmentPathDiscovery>;
  listEnvironments(): Promise<EnvironmentProfile[]>;
  probeEnvironment(profile: EnvironmentProfile): Promise<ProbeResult>;
  saveEnvironment(profile: EnvironmentProfile): Promise<ProbeResult>;
};

export const tauriEnvironmentApi: EnvironmentApi = {
  discoverEnvironmentPaths(comfyRoot) {
    if (!isTauriRuntime()) {
      return Promise.resolve(createEmptyDiscovery());
    }
    return invoke<EnvironmentPathDiscovery>("discover_environment_paths", {
      comfyRoot
    });
  },
  listEnvironments() {
    if (!isTauriRuntime()) {
      return Promise.resolve([]);
    }
    return invoke<EnvironmentProfile[]>("list_environments");
  },
  probeEnvironment(profile) {
    return invoke<ProbeResult>("probe_environment", { profile });
  },
  saveEnvironment(profile) {
    return invoke<ProbeResult>("save_environment", { profile });
  }
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createEmptyDiscovery(): EnvironmentPathDiscovery {
  return {
    python_executable: null,
    roots: {
      models: [],
      input: [],
      output: [],
      workflows: [],
      custom_nodes: []
    }
  };
}
