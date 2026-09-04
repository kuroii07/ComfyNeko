import {
  AlertTriangle,
  FileImage,
  Info,
  LoaderCircle,
  Maximize2,
  X
} from "lucide-react";

import { translate, type Locale } from "../../i18n/translate";
import type {
  AssetDetail,
  AssetDetailLoadState
} from "./assetDetailApi";
import {
  summarizeComfyPrompt,
  type ComfyMetadataSummary,
  type MetadataField
} from "./comfyMetadataSummary";

export function AssetDetailInspector({
  detail,
  error,
  locale,
  state,
  onClose,
  onPreview
}: {
  detail: AssetDetail | null;
  error: string | null;
  locale: Locale;
  state: AssetDetailLoadState;
  onClose?: () => void;
  onPreview?: (asset: AssetDetail["asset"]) => void;
}) {
  if (state === "unselected") {
    return (
      <aside
        aria-label={translate(locale, "assets.detail.title")}
        className="asset-detail-inspector asset-detail-inspector--empty"
      >
        <Info aria-hidden="true" />
        <strong>{translate(locale, "assets.detail.unselected")}</strong>
        <span>{translate(locale, "assets.detail.unselectedHelp")}</span>
      </aside>
    );
  }

  if (state === "loading") {
    return (
      <aside
        aria-label={translate(locale, "assets.detail.title")}
        aria-live="polite"
        className="asset-detail-inspector asset-detail-inspector--empty"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="spin" />
        <strong>{translate(locale, "assets.detail.loading")}</strong>
      </aside>
    );
  }

  if (state === "error") {
    return (
      <aside
        aria-label={translate(locale, "assets.detail.title")}
        className="asset-detail-inspector asset-detail-inspector--error"
        role="alert"
      >
        <AlertTriangle aria-hidden="true" />
        <strong>{translate(locale, "assets.detail.error")}</strong>
        {error ? <span title={error}>{error}</span> : null}
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside
        aria-label={translate(locale, "assets.detail.title")}
        className="asset-detail-inspector asset-detail-inspector--empty"
      >
        <Info aria-hidden="true" />
        <strong>{translate(locale, "assets.detail.metadata.none")}</strong>
      </aside>
    );
  }

  const { asset, metadata } = detail;

  return (
    <aside
      aria-label={translate(locale, "assets.detail.title")}
      className="asset-detail-inspector"
    >
      <header className="asset-detail-inspector__header">
        <FileImage aria-hidden="true" />
        <div>
          <strong title={asset.name}>{asset.name}</strong>
          <span>{translate(locale, "assets.detail.fileInfo")}</span>
        </div>
        {onClose ? (
          <button
            aria-label={translate(locale, "assets.detail.close")}
            className="asset-detail-inspector__close"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <dl className="asset-detail-inspector__facts">
        <Fact label={translate(locale, "assets.detail.root")} value={asset.root_kind} />
        <Fact
          label={translate(locale, "assets.detail.size")}
          value={formatBytes(asset.size_bytes)}
        />
        <Fact
          label={translate(locale, "assets.detail.modified")}
          value={asset.modified_at ?? translate(locale, "assets.detail.unknown")}
        />
      </dl>

      {asset.kind === "image" && onPreview ? (
        <button className="asset-detail-inspector__preview" type="button" onClick={() => onPreview(asset)}>
          <Maximize2 aria-hidden="true" />
          {translate(locale, "assets.preview.open")}
        </button>
      ) : null}

      <section className="asset-detail-inspector__metadata">
        <div className="asset-detail-inspector__section-heading">
          <h2>{translate(locale, "assets.detail.metadata")}</h2>
          {metadata?.source === "png_metadata" ? (
            <span>{translate(locale, "assets.detail.source.png")}</span>
          ) : null}
        </div>
        {metadata ? (
          <MetadataContent locale={locale} metadata={metadata} />
        ) : (
          <p>{translate(locale, "assets.detail.metadata.none")}</p>
        )}
      </section>

      <section className="asset-detail-inspector__run">
        <h2>{translate(locale, "assets.detail.run")}</h2>
        <p>{translate(locale, "assets.detail.run.none")}</p>
      </section>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MetadataContent({
  locale,
  metadata
}: {
  locale: Locale;
  metadata: NonNullable<AssetDetail["metadata"]>;
}) {
  if (metadata.state === "empty") {
    return <p>{translate(locale, "assets.detail.metadata.empty")}</p>;
  }
  if (metadata.state === "unsupported") {
    return <p>{translate(locale, "assets.detail.metadata.unsupported")}</p>;
  }
  if (metadata.state === "unavailable") {
    return <p>{translate(locale, "assets.detail.metadata.unavailable")}</p>;
  }

  const summary = summarizeComfyPrompt(metadata.prompt_text);

  return (
    <div className="asset-detail-inspector__metadata-content">
      <section className="asset-detail-inspector__summary" aria-label={translate(locale, "assets.detail.metadata.summary")}>
        <h3>{translate(locale, "assets.detail.metadata.summary")}</h3>
        <div className="asset-detail-inspector__summary-grid">
          <SummaryField locale={locale} label="assets.detail.metadata.positive" field={summary.positivePrompt} multiline />
          <SummaryField locale={locale} label="assets.detail.metadata.negative" field={summary.negativePrompt} multiline />
          <SummaryField locale={locale} label="assets.detail.metadata.model" field={summary.model} />
          <SummaryField locale={locale} label="assets.detail.metadata.sampler" field={summary.sampler} />
          <SummaryField locale={locale} label="assets.detail.metadata.scheduler" field={summary.scheduler} />
          <SummaryField locale={locale} label="assets.detail.metadata.steps" field={summary.steps} />
          <SummaryField locale={locale} label="assets.detail.metadata.cfg" field={summary.cfg} />
          <SummaryField locale={locale} label="assets.detail.metadata.seed" field={summary.seed} />
          <SummaryField locale={locale} label="assets.detail.metadata.denoise" field={summary.denoise} />
          <SummaryField locale={locale} label="assets.detail.metadata.width" field={summary.width} />
          <SummaryField locale={locale} label="assets.detail.metadata.height" field={summary.height} />
        </div>
      </section>
      <details>
        <summary>{translate(locale, "assets.detail.metadata.advanced")}</summary>
        <MetadataBlock label="Prompt" text={metadata.prompt_text} invalid={metadata.state === "invalid"} />
        <MetadataBlock label="Workflow" text={metadata.workflow_text} invalid={metadata.state === "invalid"} />
      </details>
    </div>
  );
}

function SummaryField({
  field,
  label,
  locale,
  multiline = false
}: {
  field: MetadataField<string | number>;
  label: Parameters<typeof translate>[1];
  locale: Locale;
  multiline?: boolean;
}) {
  return (
    <div className={`asset-detail-inspector__summary-field${multiline ? " asset-detail-inspector__summary-field--wide" : ""}`}>
      <span>{translate(locale, label)}</span>
      <strong data-confidence={field.confidence} title={field.value === null ? translate(locale, "assets.detail.metadata.unresolved") : undefined}>
        {field.value === null ? translate(locale, "assets.detail.metadata.unresolved") : String(field.value)}
      </strong>
    </div>
  );
}

function MetadataBlock({
  invalid,
  label,
  text
}: {
  invalid: boolean;
  label: string;
  text: string | null;
}) {
  return (
    <details open={text !== null}>
      <summary>{label}</summary>
      {text ? <pre data-invalid={invalid || undefined}>{formatJson(text)}</pre> : <p>—</p>}
    </details>
  );
}

function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
