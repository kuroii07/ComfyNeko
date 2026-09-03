import { FolderCog } from "lucide-react";
import type { ReactNode } from "react";

import { translate, type Locale } from "../../i18n/translate";

type GeneralEnvironmentSettingsProps = {
  children: ReactNode;
  locale: Locale;
};

export function GeneralEnvironmentSettings({
  children,
  locale
}: GeneralEnvironmentSettingsProps) {
  return (
    <div
      aria-labelledby="environment-settings-tab-general"
      id="environment-settings-panel-general"
      role="tabpanel"
    >
      <section className="environment-settings-section">
        <aside className="environment-settings-section__intro">
          <FolderCog aria-hidden="true" />
          <div>
            <h3>{translate(locale, "environment.general.panel.title")}</h3>
            <p>{translate(locale, "environment.general.panel.description")}</p>
          </div>
        </aside>
        <div
          className="environment-settings-panel"
          data-testid="general-environment-config-panel"
        >
          {children}
        </div>
      </section>
    </div>
  );
}
