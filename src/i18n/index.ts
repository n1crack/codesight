import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import tr from "./locales/tr.json";

export const SUPPORTED_LANGS = ["en", "tr"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "codesight.lang",
    },
  });

export default i18n;
