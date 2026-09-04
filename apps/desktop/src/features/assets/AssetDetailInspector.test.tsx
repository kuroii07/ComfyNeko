import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AssetDetail } from "./assetDetailApi";
import { AssetDetailInspector } from "./AssetDetailInspector";

const detail: AssetDetail = {
  asset: {
    id: "asset-1",
    environment_id: "environment-1",
    root_kind: "output",
    kind: "image",
    name: "metadata.png",
    directory: "D:\\ComfyUI\\output",
    normalized_path: "D:\\ComfyUI\\output\\metadata.png",
    size_bytes: 2048,
    modified_at: "2026-09-04T09:00:00Z",
    fingerprint: null,
    indexed_at: "2026-09-04T09:01:00Z",
    last_seen_at: "2026-09-04T09:01:00Z",
    availability: "present",
    missing_since: null
  },
  metadata: {
    state: "available",
    source: "png_metadata",
    prompt_text: '{"1":{"inputs":{"text":"cat"}}}',
    workflow_text: '{"last_node_id":1}',
    parsed_at: "2026-09-04T09:02:00Z"
  }
};

describe("AssetDetailInspector", () => {
  it("explains how to open an asset detail before one is selected", () => {
    render(
      <AssetDetailInspector
        detail={null}
        error={null}
        locale="zh-CN"
        state="unselected"
      />
    );

    expect(screen.getByText("选择一项资产查看详情")).toBeInTheDocument();
  });

  it("shows embedded ComfyUI metadata with its source", () => {
    render(
      <AssetDetailInspector
        detail={detail}
        error={null}
        locale="zh-CN"
        state="ready"
      />
    );

    expect(screen.getByText("metadata.png")).toBeInTheDocument();
    expect(screen.getByText("PNG metadata")).toBeInTheDocument();
    expect(screen.getByText("生成摘要")).toBeInTheDocument();
    expect(screen.getByText("高级数据")).toBeInTheDocument();
    expect(screen.getByText("正向提示词")).toBeInTheDocument();
    expect(screen.getAllByText("未解析").length).toBeGreaterThan(0);
    expect(screen.getByText(/"text": "cat"/)).toBeInTheDocument();
  });
});
