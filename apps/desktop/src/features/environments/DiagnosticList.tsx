import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { translate, type Locale } from "../../i18n/translate";
import type { ProbeResult } from "./environmentApi";

type DiagnosticListProps = {
  locale: Locale;
  probe: ProbeResult | null;
};

export function DiagnosticList({ locale, probe }: DiagnosticListProps) {
  if (!probe) {
    return (
      <div className="diagnostic-empty">
        <Info aria-hidden="true" />
        <p>{translate(locale, "environment.diagnostics.pending")}</p>
      </div>
    );
  }

  if (probe.diagnostics.length === 0) {
    return (
      <div className="diagnostic-empty diagnostic-empty--success">
        <CheckCircle2 aria-hidden="true" />
        <p>{translate(locale, "environment.diagnostics.clear")}</p>
      </div>
    );
  }

  return (
    <ul
      aria-label={translate(locale, "environment.diagnostics.title")}
      className="diagnostic-list"
    >
      {probe.diagnostics.map((diagnostic) => (
        <li
          className="diagnostic-list__item"
          data-severity={diagnostic.severity}
          key={`${diagnostic.code}-${diagnostic.message}`}
        >
          {diagnostic.severity === "blocking" ? (
            <AlertCircle aria-hidden="true" />
          ) : (
            <AlertTriangle aria-hidden="true" />
          )}
          <div>
            <strong>{diagnostic.code}</strong>
            <p>{diagnostic.message}</p>
            {diagnostic.evidence ? <code>{diagnostic.evidence}</code> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
