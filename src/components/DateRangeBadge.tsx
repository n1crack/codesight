import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";

import { useAppState } from "@/state/AppState";

const LABEL_KEY: Record<string, string> = {
  "7d": "topbar.date7d",
  "30d": "topbar.date30d",
  "90d": "topbar.date90d",
  "6m": "topbar.date6m",
  "1y": "topbar.date1y",
};

export function DateRangeBadge() {
  const { t } = useTranslation();
  const { dateRange } = useAppState();
  if (dateRange === "all") return null;
  const key = LABEL_KEY[dateRange];
  if (!key) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
      <Calendar size={10} />
      {t(key)}
    </span>
  );
}
