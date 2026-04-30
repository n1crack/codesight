import { useTranslation } from "react-i18next";

import { SectionShell } from "@/components/SectionShell";

export function ActivitySection() {
  const { t } = useTranslation();
  return (
    <SectionShell
      title={t("section.activity.title")}
      subtitle={t("section.activity.subtitle")}
      tabs={[
        { to: "heatmap", label: t("section.activity.heatmap") },
        { to: "timeline", label: t("section.activity.timeline") },
        { to: "patterns", label: t("section.activity.patterns") },
      ]}
    />
  );
}
