import { Gauge } from "lucide-react";

import { translate, type Locale } from "../../i18n/translate";
import {
  applyAccelerationPreset,
  type AccelerationDraft,
  type AccelerationPreset
} from "./environmentSettingsDraft";

const presets: Array<{
  id: AccelerationPreset;
  labelKey:
    | "environment.acceleration.preset.stable"
    | "environment.acceleration.preset.balanced"
    | "environment.acceleration.preset.performance"
    | "environment.acceleration.preset.custom";
  descriptionKey:
    | "environment.acceleration.preset.stable.description"
    | "environment.acceleration.preset.balanced.description"
    | "environment.acceleration.preset.performance.description"
    | "environment.acceleration.preset.custom.description";
}> = [
  {
    id: "stable",
    labelKey: "environment.acceleration.preset.stable",
    descriptionKey: "environment.acceleration.preset.stable.description"
  },
  {
    id: "balanced",
    labelKey: "environment.acceleration.preset.balanced",
    descriptionKey: "environment.acceleration.preset.balanced.description"
  },
  {
    id: "performance",
    labelKey: "environment.acceleration.preset.performance",
    descriptionKey: "environment.acceleration.preset.performance.description"
  },
  {
    id: "custom",
    labelKey: "environment.acceleration.preset.custom",
    descriptionKey: "environment.acceleration.preset.custom.description"
  }
];

type AccelerationSettingsProps = {
  acceleration: AccelerationDraft;
  locale: Locale;
  onChange(next: AccelerationDraft): void;
};

export function AccelerationSettings({
  acceleration,
  locale,
  onChange
}: AccelerationSettingsProps) {
  function updateOption<Key extends keyof Omit<AccelerationDraft, "preset">>(
    key: Key,
    value: AccelerationDraft[Key]
  ) {
    onChange({ ...acceleration, preset: "custom", [key]: value });
  }

  return (
    <div
      aria-labelledby="environment-settings-tab-acceleration"
      id="environment-settings-panel-acceleration"
      role="tabpanel"
    >
      <section className="environment-settings-section">
        <aside className="environment-settings-section__intro">
          <Gauge aria-hidden="true" />
          <div>
            <h3>{translate(locale, "environment.acceleration.panel.title")}</h3>
            <p>{translate(locale, "environment.acceleration.panel.description")}</p>
          </div>
        </aside>
        <div className="environment-settings-panel acceleration-settings">
          <section className="acceleration-settings__presets">
            <div className="acceleration-settings__heading">
              <strong>{translate(locale, "environment.acceleration.presets")}</strong>
              <small>{translate(locale, "environment.acceleration.localDraft")}</small>
            </div>
            <div className="acceleration-settings__preset-grid">
              {presets.map((preset) => (
                <button
                  aria-label={translate(locale, preset.labelKey)}
                  aria-pressed={acceleration.preset === preset.id}
                  className="acceleration-settings__preset"
                  key={preset.id}
                  type="button"
                  onClick={() => onChange(applyAccelerationPreset(preset.id))}
                >
                  <strong>{translate(locale, preset.labelKey)}</strong>
                  <small>{translate(locale, preset.descriptionKey)}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="acceleration-settings__options">
            <OptionSelect
              label={translate(locale, "environment.acceleration.memory")}
              value={acceleration.memoryStrategy}
              onChange={(value) => updateOption("memoryStrategy", value as AccelerationDraft["memoryStrategy"])}
            >
              <option value="low">{translate(locale, "environment.acceleration.memory.low")}</option>
              <option value="normal">{translate(locale, "environment.acceleration.memory.normal")}</option>
              <option value="high">{translate(locale, "environment.acceleration.memory.high")}</option>
            </OptionSelect>
            <OptionSelect
              label={translate(locale, "environment.acceleration.attention")}
              value={acceleration.attention}
              onChange={(value) => updateOption("attention", value as AccelerationDraft["attention"])}
            >
              <option value="auto">{translate(locale, "environment.acceleration.option.auto")}</option>
              <option value="sage">SageAttention</option>
              <option value="flash">Flash Attention</option>
              <option value="xformers">xFormers</option>
            </OptionSelect>
            <OptionSelect
              label={translate(locale, "environment.acceleration.precision")}
              value={acceleration.precision}
              onChange={(value) => updateOption("precision", value as AccelerationDraft["precision"])}
            >
              <option value="auto">{translate(locale, "environment.acceleration.option.auto")}</option>
              <option value="fp16">FP16</option>
              <option value="bf16">BF16</option>
              <option value="fp32">FP32</option>
            </OptionSelect>
            <OptionSelect
              label={translate(locale, "environment.acceleration.preview")}
              value={acceleration.preview}
              onChange={(value) => updateOption("preview", value as AccelerationDraft["preview"])}
            >
              <option value="auto">{translate(locale, "environment.acceleration.option.auto")}</option>
              <option value="none">{translate(locale, "environment.acceleration.preview.none")}</option>
              <option value="latent">Latent</option>
              <option value="taesd">TAESD</option>
            </OptionSelect>
            <OptionSelect
              label={translate(locale, "environment.acceleration.logLevel")}
              value={acceleration.logLevel}
              onChange={(value) => updateOption("logLevel", value as AccelerationDraft["logLevel"])}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </OptionSelect>
          </section>
          <p className="environment-safety-notice" role="status">
            {translate(locale, "environment.acceleration.safety")}
          </p>
        </div>
      </section>
    </div>
  );
}

function OptionSelect({
  children,
  label,
  onChange,
  value
}: {
  children: React.ReactNode;
  label: string;
  onChange(value: string): void;
  value: string;
}) {
  return (
    <label className="acceleration-settings__option">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}
