import { CircleHelp, Keyboard } from "lucide-react";
import { useState } from "react";

import { translate, type Locale } from "../i18n/translate";
import { Tooltip } from "./Tooltip";

type HeaderPanel = "help" | "keyboard" | null;

type PageHeaderProps = {
  description: string;
  help: string;
  keyboardHelp: string;
  locale: Locale;
  title: string;
};

export function PageHeader({
  description,
  help,
  keyboardHelp,
  locale,
  title
}: PageHeaderProps) {
  const [panel, setPanel] = useState<HeaderPanel>(null);

  function togglePanel(nextPanel: Exclude<HeaderPanel, null>) {
    setPanel((current) => (current === nextPanel ? null : nextPanel));
  }

  return (
    <header className="settings-page__header">
      <div className="settings-page__heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-header__actions">
        <Tooltip label={translate(locale, "common.pageHelp")}>
          <button
            aria-expanded={panel === "help"}
            aria-label={translate(locale, "common.pageHelp")}
            className="page-header__icon"
            type="button"
            onClick={() => togglePanel("help")}
          >
            <CircleHelp aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={translate(locale, "common.keyboardHelp")}>
          <button
            aria-expanded={panel === "keyboard"}
            aria-label={translate(locale, "common.keyboardHelp")}
            className="page-header__icon"
            type="button"
            onClick={() => togglePanel("keyboard")}
          >
            <Keyboard aria-hidden="true" />
          </button>
        </Tooltip>
        {panel ? (
          <div className="page-header__popover" role="status">
            <strong>
              {translate(
                locale,
                panel === "help" ? "common.pageHelp" : "common.keyboardHelp"
              )}
            </strong>
            <p>{panel === "help" ? help : keyboardHelp}</p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
