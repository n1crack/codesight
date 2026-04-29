import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "system";

type AppContextValue = {
  selectedRepoId: number | null;
  setSelectedRepoId: (id: number | null) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const THEME_KEY = "codesight.theme";
const REPO_KEY = "codesight.selectedRepoId";

function readTheme(): Theme {
  const t = localStorage.getItem(THEME_KEY);
  if (t === "light" || t === "dark" || t === "system") return t;
  return "dark";
}

function readSelectedRepoId(): number | null {
  const raw = localStorage.getItem(REPO_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [selectedRepoId, setSelectedRepoIdState] = useState<number | null>(() =>
    readSelectedRepoId(),
  );
  const [theme, setThemeState] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setSelectedRepoId = (id: number | null) => {
    setSelectedRepoIdState(id);
    if (id == null) localStorage.removeItem(REPO_KEY);
    else localStorage.setItem(REPO_KEY, String(id));
  };

  const value = useMemo<AppContextValue>(
    () => ({ selectedRepoId, setSelectedRepoId, theme, setTheme: setThemeState }),
    [selectedRepoId, theme],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const v = useContext(AppContext);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
