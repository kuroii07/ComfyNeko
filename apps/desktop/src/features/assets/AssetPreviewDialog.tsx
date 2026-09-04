import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { translate, type Locale } from "../../i18n/translate";
import type { AssetPreviewState } from "./assetPreviewApi";

export function AssetPreviewDialog({
  assetName,
  locale = "zh-CN",
  onClose,
  previewUrl,
  state
}: {
  assetName: string;
  locale?: Locale;
  onClose: () => void;
  previewUrl: string | null;
  state: AssetPreviewState;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  return (
    <div className="asset-preview-dialog__backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        aria-label={translate(locale, "assets.preview.title")}
        aria-modal="true"
        className="asset-preview-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <header className="asset-preview-dialog__header">
          <strong title={assetName}>{assetName}</strong>
          <button ref={closeRef} aria-label={translate(locale, "assets.preview.close")} type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="asset-preview-dialog__content">
          {state === "ready" && previewUrl ? (
            <img src={previewUrl} alt={assetName} />
          ) : (
            <p>{translate(locale, "assets.preview.unavailable")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
