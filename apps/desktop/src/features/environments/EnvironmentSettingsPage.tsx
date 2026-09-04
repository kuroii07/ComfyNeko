import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle
} from "lucide-react";
import type { ReactNode } from "react";

import { translate, type Locale, type MessageKey } from "../../i18n/translate";
import type { EnvironmentProfile } from "./environmentApi";
import {
  EnvironmentSettingsTabs,
  type EnvironmentSettingsTab
} from "./EnvironmentSettingsTabs";

export type EnvironmentPageStatus =
  | "pending"
  | "probing"
  | "blocked"
  | "draft-error"
  | "ready"
  | "saving"
  | "saved"
  | "session-draft"
  | "error";

type EnvironmentSettingsPageProps = {
  activeTab: EnvironmentSettingsTab;
  actions: ReactNode;
  children: ReactNode;
  locale: Locale;
  onTabChange(tab: EnvironmentSettingsTab): void;
  profile: EnvironmentProfile;
  status: EnvironmentPageStatus;
};

export function EnvironmentSettingsPage({
  activeTab,
  actions,
  children,
  locale,
  onTabChange,
  profile,
  status
}: EnvironmentSettingsPageProps) {
  const statusKey = statusMessageKeys[status];
  const StatusIcon =
    status === "ready" || status === "saved"
      ? CheckCircle2
      : status === "probing" || status === "saving"
        ? LoaderCircle
        : status === "blocked" || status === "draft-error" || status === "error"
          ? AlertCircle
          : Clock3;

  return (
    <section
      aria-label={translate(locale, "environment.title")}
      className="environment-settings-page"
      data-active-tab={activeTab}
    >
      <header className="environment-settings-page__header">
        <h1 className="visually-hidden">
          {translate(locale, "environment.settingsTitle")}
        </h1>
        <div className="environment-settings-page__context">
          <strong title={profile.name}>
            {profile.name.trim() ||
              translate(locale, "environment.profile.unnamed")}
          </strong>
          <div
            className="environment-settings-page__state"
            data-status={status}
            role="status"
          >
            <StatusIcon
              aria-hidden="true"
              className={
                status === "probing" || status === "saving" ? "spin" : undefined
              }
            />
            <span>{translate(locale, statusKey)}</span>
          </div>
        </div>

        <EnvironmentSettingsTabs
          activeTab={activeTab}
          locale={locale}
          onTabChange={onTabChange}
        />

        <div className="environment-actions environment-settings-page__actions">
          {actions}
        </div>
      </header>
      <div className="environment-settings-page__content">{children}</div>
    </section>
  );
}

const statusMessageKeys: Record<EnvironmentPageStatus, MessageKey> = {
  blocked: "environment.status.blocked",
  "draft-error": "environment.status.draftError",
  error: "environment.requestFailed",
  pending: "environment.status.pending",
  probing: "environment.probing",
  ready: "environment.status.ready",
  saved: "environment.status.saved",
  saving: "environment.saving",
  "session-draft": "environment.status.sessionDraft"
};
