import { Braces } from "lucide-react";
import { useRef } from "react";

import { translate, type Locale } from "../../i18n/translate";
import {
  parseEnvironmentVariableDraft,
  type VariableParseErrorCode
} from "./environmentSettingsDraft";

type EnvironmentVariablesSettingsProps = {
  locale: Locale;
  onChange(value: string): void;
  value: string;
};

const errorKeys: Record<
  VariableParseErrorCode,
  | "environment.variables.error.duplicateKey"
  | "environment.variables.error.emptyKey"
  | "environment.variables.error.missingEquals"
> = {
  "duplicate-key": "environment.variables.error.duplicateKey",
  "empty-key": "environment.variables.error.emptyKey",
  "missing-equals": "environment.variables.error.missingEquals"
};

export function EnvironmentVariablesSettings({
  locale,
  onChange,
  value
}: EnvironmentVariablesSettingsProps) {
  const lineNumberRef = useRef<HTMLOutputElement>(null);
  const result = parseEnvironmentVariableDraft(value);
  const lines = Math.max(1, value.split(/\r?\n/).length);

  return (
    <div
      aria-labelledby="environment-settings-tab-variables"
      id="environment-settings-panel-variables"
      role="tabpanel"
    >
      <section className="environment-settings-section">
        <aside className="environment-settings-section__intro">
          <Braces aria-hidden="true" />
          <div>
            <h3>{translate(locale, "environment.variables.panel.title")}</h3>
            <p>{translate(locale, "environment.variables.description")}</p>
          </div>
        </aside>
        <div className="environment-settings-panel environment-variables-settings">
          <div className="environment-variables-settings__notice" role="status">
            <strong>{translate(locale, "environment.variables.protected")}</strong>
            <small>{translate(locale, "environment.variables.help")}</small>
          </div>
          <label className="environment-variables-settings__editor">
            <span>{translate(locale, "environment.variables.input")}</span>
            <div className="environment-variables-settings__code-wrap">
              <output
                aria-hidden="true"
                className="environment-variables-settings__line-numbers"
                data-testid="environment-variable-line-numbers"
                ref={lineNumberRef}
              >
                {Array.from({ length: lines }, (_, index) => index + 1).join("\n")}
              </output>
              <textarea
                aria-describedby="environment-variable-draft-help"
                aria-label={translate(locale, "environment.variables.input")}
                placeholder={translate(locale, "environment.variables.placeholder")}
                spellCheck={false}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onScroll={(event) => {
                  if (lineNumberRef.current) {
                    lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
                  }
                }}
              />
            </div>
          </label>
          <small className="sr-only" id="environment-variable-draft-help">
            {translate(locale, "environment.variables.localOnly")}
          </small>
          {result.errors.length > 0 ? (
            <div aria-live="polite" className="environment-variables-settings__errors" role="alert">
              {result.errors.map((error) => (
                <p key={`${error.line}-${error.code}`}>
                  {translate(locale, errorKeys[error.code]).replace(
                    "{line}",
                    String(error.line)
                  )}
                </p>
              ))}
            </div>
          ) : (
            <p aria-live="polite" className="environment-variables-settings__valid" role="status">
              {translate(locale, "environment.variables.valid")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
