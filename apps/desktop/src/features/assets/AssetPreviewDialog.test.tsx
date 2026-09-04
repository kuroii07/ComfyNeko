import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetPreviewDialog } from "./AssetPreviewDialog";

describe("AssetPreviewDialog", () => {
  it("shows a preview image, closes with Escape, and returns focus", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();

    render(
      <AssetPreviewDialog
        assetName="cat.png"
        previewUrl="asset://preview/cat.webp"
        state="ready"
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "cat.png" })).toHaveAttribute(
      "src",
      "asset://preview/cat.webp"
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a stable fallback when a preview is unavailable", () => {
    render(
      <AssetPreviewDialog
        assetName="audio.mp3"
        previewUrl={null}
        state="unavailable"
        onClose={() => undefined}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("暂无可用预览")).toBeInTheDocument();
  });
});
