import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/PageHeader";
import { SUPPORTED_LANGS } from "@/i18n";
import { useAppState } from "@/state/AppState";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useAppState();

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="p-6">
        <div className="grid grid-cols-1 gap-3 md:max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.language")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Select<string>
                value={i18n.language?.startsWith("tr") ? "tr" : "en"}
                onChange={(v) => i18n.changeLanguage(v)}
                options={SUPPORTED_LANGS.map((l) => ({
                  value: l,
                  label: l === "en" ? "English" : "Türkçe",
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.theme")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Select<"light" | "dark" | "system">
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: t("settings.themeLight") },
                  { value: "dark", label: t("settings.themeDark") },
                  { value: "system", label: t("settings.themeSystem") },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
