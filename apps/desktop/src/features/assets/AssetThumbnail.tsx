import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import type { AssetListItem } from "./assetQueryApi";
import {
  tauriAssetThumbnailApi,
  type AssetThumbnailApi
} from "./assetThumbnailApi";

export type AssetThumbnailProps = {
  asset: AssetListItem;
  api?: AssetThumbnailApi;
  fallback: ReactNode;
};

type RenderStatus = "idle" | "loading" | "ready" | "fallback";

type RenderState = {
  assetId: string;
  sourceUrl: string | null;
  status: RenderStatus;
};

export function AssetThumbnail({
  api = tauriAssetThumbnailApi,
  asset,
  fallback
}: AssetThumbnailProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [visibleAssetId, setVisibleAssetId] = useState<string | null>(
    null
  );
  const [renderState, setRenderState] = useState<RenderState>({
    assetId: asset.id,
    sourceUrl: null,
    status: "idle"
  });
  const canLoad =
    asset.kind === "image" && asset.availability === "present";

  useEffect(() => {
    setRenderState({
      assetId: asset.id,
      sourceUrl: null,
      status: "idle"
    });
    setVisibleAssetId((current) =>
      current === asset.id ? current : null
    );

    if (!canLoad) {
      return;
    }

    const preview = previewRef.current;
    if (!preview) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setVisibleAssetId(asset.id);
      return;
    }

    let active = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (active && entry?.isIntersecting) {
          setVisibleAssetId(asset.id);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" }
    );
    observer.observe(preview);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [asset.id, canLoad]);

  useEffect(() => {
    if (!canLoad || visibleAssetId !== asset.id) {
      return;
    }

    let active = true;
    setRenderState({
      assetId: asset.id,
      sourceUrl: null,
      status: "loading"
    });

    void api
      .get(asset.id)
      .then((thumbnail) => {
        if (!active) {
          return;
        }
        if (
          thumbnail.assetId === asset.id &&
          thumbnail.state === "ready" &&
          thumbnail.sourceUrl
        ) {
          setRenderState({
            assetId: asset.id,
            sourceUrl: thumbnail.sourceUrl,
            status: "ready"
          });
          return;
        }
        setRenderState({
          assetId: asset.id,
          sourceUrl: null,
          status: "fallback"
        });
      })
      .catch(() => {
        if (active) {
          setRenderState({
            assetId: asset.id,
            sourceUrl: null,
            status: "fallback"
          });
        }
      });

    return () => {
      active = false;
    };
  }, [api, asset.id, canLoad, visibleAssetId]);

  const currentState =
    renderState.assetId === asset.id ? renderState : null;
  const status: RenderStatus = canLoad
    ? (currentState?.status ?? "idle")
    : "fallback";
  const sourceUrl =
    status === "ready" ? currentState?.sourceUrl : null;

  return (
    <div
      className="asset-thumbnail"
      data-thumbnail-state={status}
      ref={previewRef}
    >
      {sourceUrl ? (
        <img
          alt=""
          decoding="async"
          draggable={false}
          src={sourceUrl}
          onError={() =>
            setRenderState({
              assetId: asset.id,
              sourceUrl: null,
              status: "fallback"
            })
          }
        />
      ) : (
        fallback
      )}
    </div>
  );
}
