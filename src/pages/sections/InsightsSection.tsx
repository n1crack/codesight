import { useTranslation } from "react-i18next";

import { SectionShell } from "@/components/SectionShell";

export function InsightsSection() {
  const { t } = useTranslation();
  return (
    <SectionShell
      title={t("section.insights.title")}
      subtitle={t("section.insights.subtitle")}
      tabs={[
        { to: "health", label: t("section.insights.health") },
        { to: "hotspots", label: t("section.insights.hotspots") },
        { to: "ownership", label: t("section.insights.ownership") },
        { to: "authors", label: t("section.insights.authors") },
        { to: "collaborators", label: t("section.insights.collaborators") },
        { to: "messages", label: t("section.insights.messages") },
        { to: "quality", label: t("section.insights.quality") },
      ]}
    />
  );
}
