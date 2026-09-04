import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetListItem } from "./assetQueryApi";
import type {
  AssetThumbnailApi,
  AssetThumbnailView
} from "./assetThumbnailApi";
import { AssetThumbnail } from "./AssetThumbnail";

describe("AssetThumbnail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests an image once only after its card enters the observed range", async () => {
    const observer = installIntersectionObserver();
    const api = createApi({
      assetId: "image-1",
      state: "unavailable",
      sourceUrl: null
    });
    renderThumbnail(createAsset("image-1", "image"), api);

    expect(api.get).not.toHaveBeenCalled();

    act(() => observer.trigger(true));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("image-1"));
    act(() => observer.trigger(true));

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("loads immediately when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const api = createApi({
      assetId: "image-direct",
      state: "unavailable",
      sourceUrl: null
    });

    renderThumbnail(createAsset("image-direct", "image"), api);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("image-direct")
    );
  });

  it.each(["video", "audio"] as const)(
    "keeps the fallback and never requests %s thumbnails",
    (kind) => {
      installIntersectionObserver();
      const api = createApi({
        assetId: `${kind}-1`,
        state: "ready",
        sourceUrl: `asset://${kind}`
      });

      renderThumbnail(createAsset(`${kind}-1`, kind), api);

      expect(screen.getByText("类型占位")).toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    }
  );

  it("renders a decorative image for a ready response", async () => {
    const observer = installIntersectionObserver();
    const api = createApi({
      assetId: "image-ready",
      state: "ready",
      sourceUrl: "asset://thumbnail.webp"
    });
    const { container } = renderThumbnail(
      createAsset("image-ready", "image"),
      api
    );

    act(() => observer.trigger(true));

    const image = await waitFor(() => {
      const element = container.querySelector("img");
      expect(element).not.toBeNull();
      return element as HTMLImageElement;
    });
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("src", "asset://thumbnail.webp");
    expect(screen.queryByText("类型占位")).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "unsupported",
      response: {
        assetId: "image-fallback",
        state: "unsupported",
        sourceUrl: null
      } satisfies AssetThumbnailView
    },
    {
      name: "unavailable",
      response: {
        assetId: "image-fallback",
        state: "unavailable",
        sourceUrl: null
      } satisfies AssetThumbnailView
    }
  ])("restores the fallback for $name responses", async ({ response }) => {
    const observer = installIntersectionObserver();
    const api = createApi(response);

    const view = renderThumbnail(
      createAsset("image-fallback", "image"),
      api
    );
    act(() => observer.trigger(true));

    await waitFor(() =>
      expect(
        view.container.querySelector("[data-thumbnail-state]")
      ).toHaveAttribute("data-thumbnail-state", "fallback")
    );
    expect(screen.getByText("类型占位")).toBeInTheDocument();
  });

  it("restores the fallback after request or image loading failures", async () => {
    const requestObserver = installIntersectionObserver();
    const rejectedApi: AssetThumbnailApi = {
      get: vi.fn().mockRejectedValue(new Error("cache unavailable"))
    };
    const first = renderThumbnail(
      createAsset("image-rejected", "image"),
      rejectedApi
    );
    act(() => requestObserver.trigger(true));
    await waitFor(() =>
      expect(
        first.container.querySelector("[data-thumbnail-state]")
      ).toHaveAttribute("data-thumbnail-state", "fallback")
    );
    first.unmount();

    const imageObserver = installIntersectionObserver();
    const readyApi = createApi({
      assetId: "image-error",
      state: "ready",
      sourceUrl: "asset://broken.webp"
    });
    const second = renderThumbnail(
      createAsset("image-error", "image"),
      readyApi
    );
    act(() => imageObserver.trigger(true));
    const image = await waitFor(() => {
      const element = second.container.querySelector("img");
      expect(element).not.toBeNull();
      return element as HTMLImageElement;
    });
    fireEvent.error(image);

    expect(screen.getByText("类型占位")).toBeInTheDocument();
    expect(second.container.querySelector("img")).toBeNull();
    expect(
      second.container.querySelector("[data-thumbnail-state]")
    ).toHaveAttribute("data-thumbnail-state", "fallback");
  });

  it("ignores a stale response after the asset id changes", async () => {
    const observers = installIntersectionObservers();
    const oldRequest = deferred<AssetThumbnailView>();
    const api: AssetThumbnailApi = {
      get: vi.fn((assetId: string): Promise<AssetThumbnailView> =>
        assetId === "image-old"
          ? oldRequest.promise
          : Promise.resolve({
              assetId,
              state: "ready",
              sourceUrl: "asset://new.webp"
            })
      )
    };
    const view = renderThumbnail(createAsset("image-old", "image"), api);
    act(() => observers[0].trigger(true));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("image-old"));

    view.rerender(
      <AssetThumbnail
        api={api}
        asset={createAsset("image-new", "image")}
        fallback={<span>类型占位</span>}
      />
    );
    act(() => observers[1].trigger(true));
    await waitFor(() =>
      expect(view.container.querySelector("img")).toHaveAttribute(
        "src",
        "asset://new.webp"
      )
    );

    await act(async () => {
      oldRequest.resolve({
        assetId: "image-old",
        state: "ready",
        sourceUrl: "asset://old.webp"
      });
      await oldRequest.promise;
    });

    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "asset://new.webp"
    );
  });
});

function renderThumbnail(asset: AssetListItem, api: AssetThumbnailApi) {
  return render(
    <AssetThumbnail
      api={api}
      asset={asset}
      fallback={<span>类型占位</span>}
    />
  );
}

function createApi(response: AssetThumbnailView): AssetThumbnailApi {
  return {
    get: vi.fn().mockResolvedValue(response)
  };
}

function createAsset(
  id: string,
  kind: AssetListItem["kind"]
): AssetListItem {
  return {
    id,
    environment_id: "environment-1",
    root_kind: "output",
    kind,
    name: `${id}.png`,
    directory: "D:\\ComfyUI\\output",
    normalized_path: `D:\\ComfyUI\\output\\${id}.png`,
    size_bytes: 1_024,
    modified_at: "2026-09-04T12:00:00Z",
    fingerprint: null,
    indexed_at: "2026-09-04T12:00:01Z",
    last_seen_at: "2026-09-04T12:00:01Z",
    availability: "present",
    missing_since: null
  };
}

function installIntersectionObserver() {
  const observers = installIntersectionObservers();

  return {
    get disconnect() {
      return observers[0].disconnect;
    },
    trigger(isIntersecting: boolean) {
      observers[0].trigger(isIntersecting);
    }
  };
}

function installIntersectionObservers() {
  const observers: Array<{
    disconnect: ReturnType<typeof vi.fn>;
    trigger(isIntersecting: boolean): void;
  }> = [];

  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((callback: IntersectionObserverCallback) => {
      const disconnect = vi.fn();
      const observer = {
        disconnect,
        trigger(isIntersecting: boolean) {
          callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            observer as unknown as IntersectionObserver
          );
        }
      };
      observers.push(observer);
      return {
        disconnect,
        observe: vi.fn(),
        root: null,
        rootMargin: "160px",
        takeRecords: () => [],
        thresholds: [0],
        unobserve: vi.fn()
      };
    })
  );

  return observers;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
