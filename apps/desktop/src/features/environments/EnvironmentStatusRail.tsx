import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";

import { translate, type Locale } from "../../i18n/translate";
import { DiagnosticList } from "./DiagnosticList";
import type { EnvironmentProfile, ProbeResult } from "./environmentApi";
import type { RequestState } from "./environmentWizardTypes";

type EnvironmentStatusRailProps = {
  locale: Locale;
  profile: EnvironmentProfile;
  probe: ProbeResult | null;
  requestState: RequestState;
};

export function EnvironmentStatusRail({
  locale,
  profile,
  probe,
  requestState
}: EnvironmentStatusRailProps) {
  const hasBlocking =
    probe?.diagnostics.some((item) => item.severity === "blocking") ?? false;
  const status = !probe ? "pending" : hasBlocking ? "blocked" : "ready";
  const completeness = [
    profile.name.trim(),
    profile.comfy_root.trim(),
    profile.python_executable?.trim()
  ].filter(Boolean).length;
  const StatusIcon =
    status === "ready" ? CircleCheck : status === "blocked" ? CircleAlert : Clock3;

  return (
    <aside
      className="environment-status-rail"
      data-testid="environment-status-rail"
      id="environment-diagnostics"
      tabIndex={-1}
    >
      <div className="environment-status-rail__heading">
        <span>{translate(locale, "environment.status.eyebrow")}</span>
        <h2>{translate(locale, "environment.status.title")}</h2>
      </div>
      <p
        aria-label={translate(locale, "environment.status.aria")}
        className="environment-readiness-pill"
        data-state={status}
        role="status"
      >
        <StatusIcon aria-hidden="true" size={16} />
        {translate(locale, `environment.status.${status}`)}
      </p>
      <div className="environment-status-grid">
        <article className="environment-status-card">
          <span>{translate(locale, "environment.status.profile")}</span>
          <strong>{completeness}/3</strong>
        </article>
        <article className="environment-status-card">
          <span>{translate(locale, "environment.status.python")}</span>
          <strong>
            {probe?.python
              ? translate(locale, "environment.status.ready")
              : translate(locale, "environment.status.pending")}
          </strong>
        </article>
        <article className="environment-status-card">
          <span>{translate(locale, "environment.status.api")}</span>
          <strong>
            {!profile.api
              ? translate(locale, "environment.command.apiOptional")
              : probe?.api?.reachable
                ? translate(locale, "environment.status.ready")
                : translate(locale, "environment.status.pending")}
          </strong>
        </article>
      </div>
      <p className="environment-status-rail__note">
        {translate(locale, "environment.status.readOnly")}
      </p>
      <DiagnosticList locale={locale} probe={probe} />
      {requestState === "error" ? (
        <p className="environment-status-rail__request">
          {translate(locale, "environment.requestFailed")}
        </p>
      ) : null}
    </aside>
  );
}
