export type AccelerationPreset =
  | "stable"
  | "balanced"
  | "performance"
  | "custom";

export type AccelerationDraft = {
  preset: AccelerationPreset;
  memoryStrategy: "low" | "normal" | "high";
  attention: "auto" | "sage" | "flash" | "xformers";
  precision: "auto" | "fp16" | "bf16" | "fp32";
  preview: "auto" | "none" | "latent" | "taesd";
  logLevel: "info" | "warning" | "error";
};

export type ModelPathCategory =
  | "checkpoints"
  | "loras"
  | "vae"
  | "textEncoders"
  | "controlNet"
  | "upscalers"
  | "unet"
  | "clipVision";

export type ModelPathDraft = {
  activeConfigId: string;
  categories: Partial<Record<ModelPathCategory, string>>;
};

export type EnvironmentSettingsDraft = {
  acceleration: AccelerationDraft;
  modelPaths: ModelPathDraft;
  variables: string;
};

export type VariableParseErrorCode =
  | "missing-equals"
  | "empty-key"
  | "duplicate-key";

export type VariableParseEntry = {
  key: string;
  value: string;
  line: number;
};

export type VariableParseResult = {
  entries: VariableParseEntry[];
  errors: Array<{ line: number; code: VariableParseErrorCode }>;
};

const presets: Record<AccelerationPreset, AccelerationDraft> = {
  stable: {
    preset: "stable",
    memoryStrategy: "low",
    attention: "auto",
    precision: "auto",
    preview: "auto",
    logLevel: "warning"
  },
  balanced: {
    preset: "balanced",
    memoryStrategy: "normal",
    attention: "auto",
    precision: "auto",
    preview: "auto",
    logLevel: "info"
  },
  performance: {
    preset: "performance",
    memoryStrategy: "high",
    attention: "flash",
    precision: "fp16",
    preview: "taesd",
    logLevel: "warning"
  },
  custom: {
    preset: "custom",
    memoryStrategy: "normal",
    attention: "auto",
    precision: "auto",
    preview: "auto",
    logLevel: "info"
  }
};

export function applyAccelerationPreset(
  preset: AccelerationPreset
): AccelerationDraft {
  return { ...presets[preset] };
}

export function createEnvironmentSettingsDraft(): EnvironmentSettingsDraft {
  return {
    acceleration: applyAccelerationPreset("balanced"),
    modelPaths: { activeConfigId: "default", categories: {} },
    variables: ""
  };
}

export function parseEnvironmentVariableDraft(
  source: string
): VariableParseResult {
  const entries: VariableParseEntry[] = [];
  const errors: VariableParseResult["errors"] = [];
  const seenKeys = new Set<string>();

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = rawLine.indexOf("=");
    if (equalsIndex < 0) {
      errors.push({ line, code: "missing-equals" });
      continue;
    }

    const key = rawLine.slice(0, equalsIndex).trim();
    if (!key) {
      errors.push({ line, code: "empty-key" });
      continue;
    }

    if (seenKeys.has(key)) {
      errors.push({ line, code: "duplicate-key" });
      continue;
    }

    seenKeys.add(key);
    entries.push({ key, value: rawLine.slice(equalsIndex + 1), line });
  }

  return { entries, errors };
}
