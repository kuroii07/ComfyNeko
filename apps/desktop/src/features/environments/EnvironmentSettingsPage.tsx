import { CheckCircle2, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

import { translate, type Locale } from "../../i18n/translate";
import type { EnvironmentProfile } from "./environmentApi";
import {
  EnvironmentSettingsTabs,
  type EnvironmentSettingsTab
} from "./EnvironmentSettingsTabs";

type EnvironmentSettingsPageProps = {
  activeTab: EnvironmentSettingsTab;
  children: ReactNode;
  locale: Locale;
  onTabChange(tab: EnvironmentSettingsTab): void;
  profile: EnvironmentProfile;
};

export function EnvironmentSettingsPage({
  activeTab,
  children,
  locale,
  onTabChange,
  profile
}: EnvironmentSettingsPageProps) {
  const isChecked = Boolean(profile.last_validated_at);

  return (
    <section
      aria-label={translate(locale, "environment.title")}
      className="environment-settings-page"
      data-active-tab={activeTab}
    >
      <header className="environment-settings-page__header">
        <div className="environment-settings-page__identity">
          <span>{translate(locale, "environment.command.eyebrow")}</span>
          <div>
            <h2>{translate(locale, "environment.settingsTitle")}</h2>
            <p>{profile.name || translate(locale, "environment.name")}</p>
          </div>
        </div>
        <div className="environment-settings-page__state" role="status">
          {isChecked ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          <span>
            {translate(
              locale,
              isChecked ? "environment.status.ready" : "environment.status.pending"
            )}
          </span>
        </div>
      </header>
      <EnvironmentSettingsTabs
        activeTab={activeTab}
        locale={locale}
        onTabChange={onTabChange}
      />
      <div className="environment-settings-page__content">{children}</div>
    </section>
  );
}
