export type MetadataConfidence = "embedded" | "unresolved";

export type MetadataField<T> = {
  value: T | null;
  source: "png_metadata";
  confidence: MetadataConfidence;
};

export type ComfyMetadataSummary = {
  positivePrompt: MetadataField<string>;
  negativePrompt: MetadataField<string>;
  model: MetadataField<string>;
  sampler: MetadataField<string>;
  scheduler: MetadataField<string>;
  steps: MetadataField<number>;
  cfg: MetadataField<number>;
  seed: MetadataField<number>;
  denoise: MetadataField<number>;
  width: MetadataField<number>;
  height: MetadataField<number>;
};

type ComfyNode = {
  class_type?: unknown;
  inputs?: Record<string, unknown>;
};

type ComfyPrompt = Record<string, ComfyNode>;

const SOURCE = "png_metadata" as const;

function field<T>(value: T | null): MetadataField<T> {
  return {
    value,
    source: SOURCE,
    confidence: value === null ? "unresolved" : "embedded"
  };
}

function emptySummary(): ComfyMetadataSummary {
  return {
    positivePrompt: field<string>(null),
    negativePrompt: field<string>(null),
    model: field<string>(null),
    sampler: field<string>(null),
    scheduler: field<string>(null),
    steps: field<number>(null),
    cfg: field<number>(null),
    seed: field<number>(null),
    denoise: field<number>(null),
    width: field<number>(null),
    height: field<number>(null)
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function linkedNodeId(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function nodeById(prompt: ComfyPrompt, value: unknown): ComfyNode | null {
  const id = linkedNodeId(value);
  return id ? prompt[id] ?? null : null;
}

function firstNode(prompt: ComfyPrompt, classType: string): [string, ComfyNode] | null {
  const entry = Object.entries(prompt).find(([, node]) => node.class_type === classType);
  return entry ?? null;
}

function textFromLink(prompt: ComfyPrompt, link: unknown): string | null {
  const node = nodeById(prompt, link);
  return node?.class_type === "CLIPTextEncode" ? asString(node.inputs?.text) : null;
}

export function summarizeComfyPrompt(promptText: string | null | undefined): ComfyMetadataSummary {
  const summary = emptySummary();
  if (!promptText) return summary;

  let parsed: unknown;
  try {
    parsed = JSON.parse(promptText);
  } catch {
    return summary;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return summary;

  const prompt = parsed as ComfyPrompt;
  const samplerEntry = firstNode(prompt, "KSampler");
  const samplerInputs = samplerEntry?.[1].inputs;

  summary.positivePrompt = field(textFromLink(prompt, samplerInputs?.positive));
  summary.negativePrompt = field(textFromLink(prompt, samplerInputs?.negative));
  summary.sampler = field(asString(samplerInputs?.sampler_name));
  summary.scheduler = field(asString(samplerInputs?.scheduler));
  summary.steps = field(asNumber(samplerInputs?.steps));
  summary.cfg = field(asNumber(samplerInputs?.cfg));
  summary.seed = field(asNumber(samplerInputs?.seed));
  summary.denoise = field(asNumber(samplerInputs?.denoise));

  const modelNode = nodeById(prompt, samplerInputs?.model);
  summary.model = field(
    modelNode?.class_type === "CheckpointLoaderSimple"
      ? asString(modelNode.inputs?.ckpt_name)
      : null
  );

  const latentNode = nodeById(prompt, samplerInputs?.latent_image);
  summary.width = field(
    latentNode?.class_type === "EmptyLatentImage" ? asNumber(latentNode.inputs?.width) : null
  );
  summary.height = field(
    latentNode?.class_type === "EmptyLatentImage" ? asNumber(latentNode.inputs?.height) : null
  );

  return summary;
}
