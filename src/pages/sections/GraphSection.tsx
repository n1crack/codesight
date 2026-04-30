import { useTranslation } from "react-i18next";

import { SectionShell } from "@/components/SectionShell";

export function GraphSection() {
  const { t } = useTranslation();
  return (
    <SectionShell
      title={t("section.graph.title")}
      subtitle={t("section.graph.subtitle")}
      tabs={[
        { to: "dag", label: t("section.graph.dag") },
        { to: "branches", label: t("section.graph.branches") },
        { to: "releases", label: t("section.graph.releases") },
      ]}
    />
  );
}
