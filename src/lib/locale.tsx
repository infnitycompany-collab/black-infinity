"use client";
import { createContext, useContext, useEffect, useState } from "react";
import arabic from "./ar.json";
const LocaleContext = createContext({
  locale: "en",
  setLocale: (_locale: string) => {},
});
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setState] = useState("en");
  const setLocale = (value: string) => {
    const next = value === "ar" ? "ar" : "en";
    setState(next);
    localStorage.setItem("bi-language", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };
  useEffect(() => {
    setLocale(localStorage.getItem("bi-language") || "en");
    const update = () => setLocale(localStorage.getItem("bi-language") || "en");
    window.addEventListener("bi-locale", update);
    return () => window.removeEventListener("bi-locale", update);
  }, []);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
export function useTranslation() {
  const { locale } = useContext(LocaleContext);
  return function tr<T>(value: T): T {
    return (
      locale === "ar" && typeof value === "string"
        ? (arabic as Record<string, string>)[value] || value
        : value
    ) as T;
  };
}
export function LanguageSwitch() {
  const { locale, setLocale } = useContext(LocaleContext);
  return (
    <button
      className="language-switch subtle-button"
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      {locale === "ar" ? "English" : "العربية"}
    </button>
  );
}
