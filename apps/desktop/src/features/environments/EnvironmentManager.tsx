import { Check, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { translate, type Locale } from "../../i18n/translate";
import {
  tauriEnvironmentApi,
  type EnvironmentApi,
  type EnvironmentProfile
} from "./environmentApi";
import { EnvironmentWizard } from "./EnvironmentWizard";

type LoadState = "loading" | "ready" | "error";

type EnvironmentManagerProps = {
  api?: EnvironmentApi;
  locale?: Locale;
};

export function EnvironmentManager({
  api = tauriEnvironmentApi,
  locale = "zh-CN"
}: EnvironmentManagerProps) {
  const [profiles, setProfiles] = useState<EnvironmentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");

  async function loadProfiles(preferredId?: string) {
    setLoadState("loading");
    setLoadError("");

    try {
      const nextProfiles = await api.listEnvironments();
      setProfiles(nextProfiles);
      setSelectedId((current) => {
        const candidateId = preferredId ?? current;
        if (candidateId && nextProfiles.some((profile) => profile.id === candidateId)) {
          return candidateId;
        }
        return nextProfiles[0]?.id ?? null;
      });
      setLoadState("ready");
    } catch (error) {
      setLoadError(String(error));
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? null;

  return (
    <div className="environment-manager">
      <div className="settings-section-label">
        {translate(locale, "environment.library.section")}
      </div>
      <section
        aria-label={translate(locale, "environment.library.title")}
        className="settings-group environment-library"
      >
        <div className="settings-row environment-library__header">
          <div className="settings-row__main">
            <strong>{translate(locale, "environment.library.title")}</strong>
            <small>{translate(locale, "environment.library.description")}</small>
          </div>
          <button
            className="button-secondary button-compact"
            type="button"
            onClick={() => setSelectedId(null)}
          >
            <Plus aria-hidden="true" />
            {translate(locale, "environment.library.new")}
          </button>
        </div>

        {loadState === "loading" ? (
          <div className="settings-row environment-library__message" role="status">
            {translate(locale, "environment.library.loading")}
          </div>
        ) : null}

        {loadState === "error" ? (
          <div className="settings-row environment-library__error" role="alert">
            <div className="settings-row__main">
              <strong>{translate(locale, "environment.library.error")}</strong>
              <small>{loadError}</small>
            </div>
            <button
              className="button-secondary button-compact"
              type="button"
              onClick={() => void loadProfiles()}
            >
              <RotateCcw aria-hidden="true" />
              {translate(locale, "environment.library.retry")}
            </button>
          </div>
        ) : null}

        {loadState === "ready" && profiles.length === 0 ? (
          <div className="settings-row environment-library__message">
            <div className="settings-row__main">
              <strong>{translate(locale, "environment.library.empty")}</strong>
              <small>{translate(locale, "environment.library.emptyHelp")}</small>
            </div>
          </div>
        ) : null}

        {loadState === "ready"
          ? profiles.map((profile) => (
              <button
                aria-label={`${profile.name} — ${profile.comfy_root}`}
                aria-pressed={profile.id === selectedId}
                className="settings-row environment-profile-row"
                key={profile.id}
                type="button"
                onClick={() => setSelectedId(profile.id)}
              >
                <span className="settings-row__main">
                  <strong>{profile.name}</strong>
                  <small>{profile.comfy_root}</small>
                </span>
                {profile.id === selectedId ? <Check aria-hidden="true" /> : null}
              </button>
            ))
          : null}
      </section>

      <EnvironmentWizard
        api={api}
        initialProfile={selectedProfile ?? undefined}
        key={selectedProfile?.id ?? "new-environment"}
        locale={locale}
        onSaved={(profile) => loadProfiles(profile.id)}
      />
    </div>
  );
}
