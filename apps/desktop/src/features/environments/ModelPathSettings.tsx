import { Boxes } from "lucide-react";
import type { ReactNode } from "react";

import { translate, type Locale } from "../../i18n/translate";
import type { ModelPathCategory } from "./environmentSettingsDraft";

const categories: Array<{
  id: ModelPathCategory;
  labelKey:
    | "environment.modelCategory.checkpoints"
    | "environment.modelCategory.loras"
    | "environment.modelCategory.vae"
    | "environment.modelCategory.textEncoders"
    | "environment.modelCategory.controlNet"
    | "environment.modelCategory.upscalers"
    | "environment.modelCategory.unet"
    | "environment.modelCategory.clipVision";
}> = [
  { id: "checkpoints", labelKey: "environment.modelCategory.checkpoints" },
  { id: "loras", labelKey: "environment.modelCategory.loras" },
  { id: "vae", labelKey: "environment.modelCategory.vae" },
  { id: "textEncoders", labelKey: "environment.modelCategory.textEncoders" },
  { id: "controlNet", labelKey: "environment.modelCategory.controlNet" },
  { id: "upscalers", labelKey: "environment.modelCategory.upscalers" },
  { id: "unet", labelKey: "environment.modelCategory.unet" },
  { id: "clipVision", labelKey: "environment.modelCategory.clipVision" }
];

type ModelPathSettingsProps = {
  categories: Partial<Record<ModelPathCategory, string>>;
  children: ReactNode;
  locale: Locale;
  onCategoryChange(category: ModelPathCategory, path: string): void;
};

export function ModelPathSettings({
  categories: categoryPaths,
  children,
  locale,
  onCategoryChange
}: ModelPathSettingsProps) {
  return (
    <div
      aria-labelledby="environment-settings-tab-model-paths"
      id="environment-settings-panel-model-paths"
      role="tabpanel"
    >
      <section className="environment-settings-section">
        <aside className="environment-settings-section__intro">
          <Boxes aria-hidden="true" />
          <div>
            <h3>{translate(locale, "environment.modelPaths.panel.title")}</h3>
            <p>{translate(locale, "environment.modelPaths.panel.description")}</p>
          </div>
        </aside>
        <div className="environment-settings-panel" data-testid="model-path-config-panel">
          {children}
          <section className="model-category-draft" aria-label={translate(locale, "environment.modelPaths.draft.title")}>
            <div className="model-category-draft__heading">
              <strong>{translate(locale, "environment.modelPaths.draft.title")}</strong>
              <small>{translate(locale, "environment.modelPaths.draft.description")}</small>
            </div>
            <div className="model-category-draft__fields">
              {categories.map((category) => {
                const label = translate(locale, category.labelKey);
                return (
                  <label key={category.id}>
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      placeholder={translate(locale, "environment.modelPaths.draft.inherit")}
                      value={categoryPaths[category.id] ?? ""}
                      onChange={(event) =>
                        onCategoryChange(category.id, event.target.value)
                      }
                    />
                  </label>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
