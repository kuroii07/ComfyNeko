import { Plus, RotateCcw } from "lucide-react";
import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

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
  onDirtyChange?(hasUnsavedChanges: boolean): void;
};

export function EnvironmentManager({
  api = tauriEnvironmentApi,
  locale = "zh-CN",
  onDirtyChange
}: EnvironmentManagerProps) {
  const [profiles, setProfiles] = useState<EnvironmentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);

  async function loadProfiles(
    preferredId?: string
  ): Promise<EnvironmentProfile | null> {
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
      return (
        (preferredId
          ? nextProfiles.find((profile) => profile.id === preferredId)
          : undefined) ??
        nextProfiles[0] ??
        null
      );
    } catch (error) {
      setLoadError(String(error));
      setLoadState("error");
      return null;
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? null;

  function restoreProfileFocus(profileId: string | null) {
    requestAnimationFrame(() => {
      document
        .getElementById(
          profileId
            ? `environment-profile-tab-${profileId}`
            : "environment-profile-new"
        )
        ?.focus();
    });
  }

  function selectProfile(profileId: string | null) {
    const resetsCurrentDraft = profileId === null && selectedId === null;
    if (profileId === selectedId && !resetsCurrentDraft) {
      return;
    }

    if (
      hasUnsavedChanges &&
      !window.confirm(
        translate(locale, "environment.library.discardChanges")
      )
    ) {
      restoreProfileFocus(selectedId);
      return;
    }

    setHasUnsavedChanges(false);
    if (resetsCurrentDraft) {
      setEditorRevision((current) => current + 1);
    } else {
      setSelectedId(profileId);
    }
    restoreProfileFocus(profileId);
  }

  function handleProfileKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    profileIndex: number
  ) {
    let nextIndex = profileIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (profileIndex + 1) % profiles.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (profileIndex - 1 + profiles.length) % profiles.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = profiles.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextProfile = profiles[nextIndex];
    selectProfile(nextProfile.id);
  }

  const profileLibrary = (
    <div className="environment-library-shell">
      <section
        aria-label={translate(locale, "environment.library.title")}
        className="environment-profile-switcher"
      >
        <div className="environment-profile-switcher__meta">
          <strong>{translate(locale, "environment.library.section")}</strong>
          {loadState === "ready" ? (
            <small>
              {profiles.length}{" "}
              {translate(
                locale,
                profiles.length === 1
                  ? "environment.library.countOne"
                  : "environment.library.countMany"
              )}
            </small>
          ) : null}
        </div>

        <div
          aria-label={
            loadState === "ready" && profiles.length > 0
              ? translate(locale, "environment.library.title")
              : undefined
          }
          className="environment-profile-switcher__rail"
          role={
            loadState === "ready" && profiles.length > 0
              ? "radiogroup"
              : undefined
          }
        >
          {loadState === "loading" ? (
            <div className="environment-profile-switcher__feedback" role="status">
              {translate(locale, "environment.library.loading")}
            </div>
          ) : null}

          {loadState === "error" ? (
            <div
              className="environment-profile-switcher__feedback environment-profile-switcher__feedback--error"
              role="alert"
            >
              <span className="environment-profile-switcher__error-copy">
                <span>{translate(locale, "environment.library.error")}</span>
                <small title={loadError}>{loadError}</small>
              </span>
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
            <div
              className="environment-profile-switcher__feedback"
              role="status"
              title={translate(locale, "environment.library.emptyHelp")}
            >
              {translate(locale, "environment.library.empty")}
            </div>
          ) : null}

          {loadState === "ready" && profiles.length > 0
            ? profiles.map((profile, profileIndex) => (
                <button
                  aria-label={`${profile.name} — ${profile.comfy_root}`}
                  aria-checked={profile.id === selectedId}
                  className="environment-profile-tab"
                  id={`environment-profile-tab-${profile.id}`}
                  key={profile.id}
                  role="radio"
                  tabIndex={
                    profile.id === selectedId ||
                    (selectedId === null && profileIndex === 0)
                      ? 0
                      : -1
                  }
                  title={`${profile.name} — ${profile.comfy_root}`}
                  type="button"
                  onKeyDown={(event) =>
                    handleProfileKeyDown(event, profileIndex)
                  }
                  onClick={() => selectProfile(profile.id)}
                >
                  <span className="environment-profile-tab__label">
                    {profile.name}
                  </span>
                </button>
              ))
            : null}
        </div>

        <button
          aria-label={translate(locale, "environment.library.new")}
          className="button-secondary button-compact environment-profile-switcher__add"
          id="environment-profile-new"
          title={translate(locale, "environment.library.new")}
          type="button"
          onClick={() => selectProfile(null)}
        >
          <Plus aria-hidden="true" />
          <span className="environment-profile-switcher__add-label">
            {translate(locale, "environment.library.new")}
          </span>
        </button>
      </section>
    </div>
  );

  return (
    <div className="environment-manager">
      <EnvironmentWizard
        api={api}
        initialProfile={selectedProfile ?? undefined}
        key={`${selectedProfile?.id ?? "new-environment"}:${editorRevision}`}
        locale={locale}
        onDirtyChange={setHasUnsavedChanges}
        onSaved={(profile) => loadProfiles(profile.id)}
        profileLibrary={profileLibrary}
      />
    </div>
  );
}
