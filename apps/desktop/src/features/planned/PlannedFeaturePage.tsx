import { Construction } from "lucide-react";

import { PageHeader } from "../../components/PageHeader";
import { translate, type Locale, type MessageKey } from "../../i18n/translate";

type PlannedFeaturePageProps = {
  locale: Locale;
  titleKey: MessageKey;
};

export function PlannedFeaturePage({
  locale,
  titleKey
}: PlannedFeaturePageProps) {
  return (
    <section className="settings-page planned-page">
      <PageHeader
        description={translate(locale, "planned.description")}
        help={translate(locale, "planned.pageHelp")}
        keyboardHelp={translate(locale, "planned.keyboardHelp")}
        locale={locale}
        title={translate(locale, titleKey)}
      />

      <div className="planned-page__notice" role="status">
        <Construction aria-hidden="true" />
        <div>
          <strong>{translate(locale, "planned.status")}</strong>
        </div>
      </div>
    </section>
  );
}
