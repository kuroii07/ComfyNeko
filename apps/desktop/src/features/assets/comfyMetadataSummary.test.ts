import { describe, expect, it } from "vitest";

import { summarizeComfyPrompt } from "./comfyMetadataSummary";

const prompt = {
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "models/checkpoints/neko.safetensors" }
  },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: { text: "a calm black cat in moonlight", clip: ["1", 1] }
  },
  "3": {
    class_type: "CLIPTextEncode",
    inputs: { text: "blurry, low quality", clip: ["1", 1] }
  },
  "4": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 28,
      cfg: 7.5,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 0.9,
      model: ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["5", 0]
    }
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 768, height: 512, batch_size: 1 }
  }
};

describe("summarizeComfyPrompt", () => {
  it("extracts linked prompts and generation parameters from ComfyUI API JSON", () => {
    const summary = summarizeComfyPrompt(JSON.stringify(prompt));

    expect(summary.positivePrompt.value).toBe("a calm black cat in moonlight");
    expect(summary.negativePrompt.value).toBe("blurry, low quality");
    expect(summary.model.value).toBe("models/checkpoints/neko.safetensors");
    expect(summary.sampler.value).toBe("euler");
    expect(summary.scheduler.value).toBe("normal");
    expect(summary.steps.value).toBe(28);
    expect(summary.cfg.value).toBe(7.5);
    expect(summary.seed.value).toBe(42);
    expect(summary.denoise.value).toBe(0.9);
    expect(summary.width.value).toBe(768);
    expect(summary.height.value).toBe(512);
    expect(summary.positivePrompt.source).toBe("png_metadata");
    expect(summary.positivePrompt.confidence).toBe("embedded");
  });

  it("marks values unresolved when links or known nodes are missing", () => {
    const summary = summarizeComfyPrompt(
      JSON.stringify({
        "1": { class_type: "KSampler", inputs: { steps: 12 } },
        "2": { class_type: "CLIPTextEncode", inputs: { text: "orphan" } }
      })
    );

    expect(summary.steps.value).toBe(12);
    expect(summary.positivePrompt.value).toBeNull();
    expect(summary.positivePrompt.confidence).toBe("unresolved");
    expect(summary.model.value).toBeNull();
  });

  it("returns an empty unresolved summary for invalid JSON or unknown nodes", () => {
    const summary = summarizeComfyPrompt("not json");
    expect(summary.positivePrompt.value).toBeNull();
    expect(summary.steps.value).toBeNull();
    expect(summary.width.value).toBeNull();

    const unknown = summarizeComfyPrompt(
      JSON.stringify({ "1": { class_type: "SomeCustomNode", inputs: { foo: "bar" } } })
    );
    expect(unknown.model.value).toBeNull();
    expect(unknown.model.confidence).toBe("unresolved");
  });
});
