import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "system";

export const IDE_OPTIONS = [
  { value: "system", label: "System default" },
  { value: "code", label: "VS Code" },
  { value: "code-insiders", label: "VS Code Insiders" },
  { value: "cursor", label: "Cursor" },
  { value: "subl", label: "Sublime Text" },
  { value: "zed", label: "Zed" },
  { value: "idea", label: "IntelliJ IDEA" },
  { value: "webstorm", label: "WebStorm" },
  { value: "phpstorm", label: "PhpStorm" },
  { value: "pycharm", label: "PyCharm" },
  { value: "rubymine", label: "RubyMine" },
  { value: "rustrover", label: "RustRover" },
  { value: "goland", label: "GoLand" },
  { value: "clion", label: "CLion" },
  { value: "rider", label: "Rider" },
  { value: "fleet", label: "Fleet" },
  { value: "hx", label: "Helix" },
] as const;
export type IdeChoice = (typeof IDE_OPTIONS)[number]["value"];
const VALID_IDES: readonly string[] = IDE_OPTIONS.map((o) => o.value);

export const TERMINAL_OPTIONS = [
  { value: "system", label: "System default" },
  { value: "terminal", label: "Terminal (macOS)" },
  { value: "iterm", label: "iTerm" },
  { value: "warp", label: "Warp" },
  { value: "ghostty", label: "Ghostty" },
  { value: "alacritty", label: "Alacritty" },
  { value: "kitty", label: "kitty" },
  { value: "wezterm", label: "WezTerm" },
  { value: "hyper", label: "Hyper" },
  { value: "tabby", label: "Tabby" },
  { value: "windows-terminal", label: "Windows Terminal" },
  { value: "gnome-terminal", label: "GNOME Terminal" },
  { value: "konsole", label: "Konsole" },
  { value: "xterm", label: "xterm" },
] as const;
export type TerminalChoice = (typeof TERMINAL_OPTIONS)[number]["value"];
const VALID_TERMINALS: readonly string[] = TERMINAL_OPTIONS.map((o) => o.value);

export type DateRangePreset =
  | "all"
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y";

export function resolveDateRangeSince(preset: DateRangePreset): string | null {
  if (preset === "all") return null;
  const days: Record<Exclude<DateRangePreset, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "6m": 180,
    "1y": 365,
  };
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days[preset]);
  return d.toISOString();
}

type AppContextValue = {
  selectedRepoId: number | null;
  setSelectedRepoId: (id: number | null) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  myEmail: string | null;
  setMyEmail: (email: string | null) => void;
  dateRange: DateRangePreset;
  setDateRange: (r: DateRangePreset) => void;
  ide: IdeChoice;
  setIde: (i: IdeChoice) => void;
  terminal: TerminalChoice;
  setTerminal: (t: TerminalChoice) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const THEME_KEY = "codesight.theme";
const REPO_KEY = "codesight.selectedRepoId";
const EMAIL_KEY = "codesight.myEmail";
const DATE_RANGE_KEY = "codesight.dateRange";
const IDE_KEY = "codesight.ide";
const TERMINAL_KEY = "codesight.terminal";

function readIde(): IdeChoice {
  const v = localStorage.getItem(IDE_KEY) ?? "";
  return (VALID_IDES.includes(v) ? v : "system") as IdeChoice;
}

function readTerminal(): TerminalChoice {
  const v = localStorage.getItem(TERMINAL_KEY) ?? "";
  return (VALID_TERMINALS.includes(v) ? v : "system") as TerminalChoice;
}

const VALID_RANGES: DateRangePreset[] = ["all", "7d", "30d", "90d", "6m", "1y"];

function readDateRange(): DateRangePreset {
  const v = localStorage.getItem(DATE_RANGE_KEY);
  return (VALID_RANGES as string[]).includes(v ?? "")
    ? (v as DateRangePreset)
    : "all";
}

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
  const [myEmail, setMyEmailState] = useState<string | null>(
    () => localStorage.getItem(EMAIL_KEY),
  );
  const [dateRange, setDateRangeState] = useState<DateRangePreset>(() =>
    readDateRange(),
  );
  const [ide, setIdeState] = useState<IdeChoice>(() => readIde());
  const [terminal, setTerminalState] = useState<TerminalChoice>(() => readTerminal());

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

  const setMyEmail = (email: string | null) => {
    setMyEmailState(email);
    if (!email) localStorage.removeItem(EMAIL_KEY);
    else localStorage.setItem(EMAIL_KEY, email);
  };

  const setDateRange = (r: DateRangePreset) => {
    setDateRangeState(r);
    localStorage.setItem(DATE_RANGE_KEY, r);
  };

  const setIde = (i: IdeChoice) => {
    setIdeState(i);
    localStorage.setItem(IDE_KEY, i);
  };

  const setTerminal = (t: TerminalChoice) => {
    setTerminalState(t);
    localStorage.setItem(TERMINAL_KEY, t);
  };

  const value = useMemo<AppContextValue>(
    () => ({
      selectedRepoId,
      setSelectedRepoId,
      theme,
      setTheme: setThemeState,
      myEmail,
      setMyEmail,
      dateRange,
      setDateRange,
      ide,
      setIde,
      terminal,
      setTerminal,
    }),
    [selectedRepoId, theme, myEmail, dateRange, ide, terminal],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const v = useContext(AppContext);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
