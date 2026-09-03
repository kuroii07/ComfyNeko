import { translate, type Locale } from "../../i18n/translate";

export type EnvironmentSettingsTab =
  | "general"
  | "acceleration"
  | "model-paths"
  | "variables";

const settingsTabs: ReadonlyArray<{
  id: EnvironmentSettingsTab;
  labelKey:
    | "environment.tabs.general"
    | "environment.tabs.acceleration"
    | "environment.tabs.modelPaths"
    | "environment.tabs.variables";
}> = [
  { id: "general", labelKey: "environment.tabs.general" },
  { id: "acceleration", labelKey: "environment.tabs.acceleration" },
  { id: "model-paths", labelKey: "environment.tabs.modelPaths" },
  { id: "variables", labelKey: "environment.tabs.variables" }
];

type EnvironmentSettingsTabsProps = {
  activeTab: EnvironmentSettingsTab;
  locale: Locale;
  onTabChange(tab: EnvironmentSettingsTab): void;
};

export function EnvironmentSettingsTabs({
  activeTab,
  locale,
  onTabChange
}: EnvironmentSettingsTabsProps) {
  function selectTab(tab: EnvironmentSettingsTab) {
    onTabChange(tab);
    requestAnimationFrame(() => {
      document.getElementById(`environment-settings-tab-${tab}`)?.focus();
    });
  }

  function moveFocus(currentTab: EnvironmentSettingsTab, offset: number) {
    const currentIndex = settingsTabs.findIndex((tab) => tab.id === currentTab);
    const nextIndex = (currentIndex + offset + settingsTabs.length) % settingsTabs.length;
    selectTab(settingsTabs[nextIndex].id);
  }

  return (
    <div
      aria-label={translate(locale, "environment.tabs.label")}
      className="environment-settings-tabs"
      role="tablist"
    >
      {settingsTabs.map((tab) => (
        <button
          aria-controls={`environment-settings-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          id={`environment-settings-tab-${tab.id}`}
          key={tab.id}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
          onClick={() => selectTab(tab.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveFocus(tab.id, 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveFocus(tab.id, -1);
            } else if (event.key === "Home") {
              event.preventDefault();
              selectTab("general");
            } else if (event.key === "End") {
              event.preventDefault();
              selectTab("variables");
            }
          }}
        >
          {translate(locale, tab.labelKey)}
        </button>
      ))}
    </div>
  );
}
