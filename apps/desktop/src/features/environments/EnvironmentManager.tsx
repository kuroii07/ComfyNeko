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
        if (
          candidateId &&
          nextProfiles.some((profile) => profile.id === candidateId)
        ) {
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
      <section
        aria-label={translate(locale, "environment.library.title")}
        className="environment-library"
      >
        <header className="environment-library__heading">
          <h2>{translate(locale, "environment.library.title")}</h2>
          <span>
            {profiles.length} {translate(locale, "environment.library.count")}
          </span>
        </header>

        {loadState === "loading" ? (
          <p className="environment-library__message" role="status">
            {translate(locale, "environment.library.loading")}
          </p>
        ) : null}

        {loadState === "error" ? (
          <div className="environment-library__error" role="alert">
            <p>
              {translate(locale, "environment.library.error")}: {loadError}
            </p>
            <button type="button" onClick={() => void loadProfiles()}>
              {translate(locale, "environment.library.retry")}
            </button>
          </div>
        ) : null}

        {loadState === "ready" && profiles.length === 0 ? (
          <p className="environment-library__message">
            {translate(locale, "environment.library.empty")}
          </p>
        ) : null}

        {loadState === "ready" && profiles.length > 0 ? (
          <ul className="environment-library__list">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  aria-label={`${profile.name} — ${profile.comfy_root}`}
                  aria-pressed={profile.id === selectedId}
                  type="button"
                  onClick={() => setSelectedId(profile.id)}
                >
                  <strong>{profile.name}</strong>
                  <span>{profile.comfy_root}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
