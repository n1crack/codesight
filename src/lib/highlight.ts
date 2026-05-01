import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";

const LANG_BY_EXT: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  lua: "lua",
};

export function langForPath(path: string | null): BundledLanguage | null {
  if (!path) return null;
  const idx = path.lastIndexOf(".");
  if (idx < 0) return null;
  const ext = path.slice(idx + 1).toLowerCase();
  return LANG_BY_EXT[ext] ?? null;
}

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = await import("shiki");
      return shiki.createHighlighter({
        themes: ["github-light", "github-dark"],
        langs: [],
      });
    })();
  }
  return highlighterPromise;
}

const loadedLangs = new Set<string>();

export async function highlightLines(
  lines: string[],
  lang: BundledLanguage,
  theme: "github-light" | "github-dark",
): Promise<ThemedToken[][]> {
  const h = await getHighlighter();
  if (!loadedLangs.has(lang)) {
    await h.loadLanguage(lang);
    loadedLangs.add(lang);
  }
  // Tokenize all lines as one block to preserve cross-line context.
  const code = lines.join("\n");
  const result = h.codeToTokens(code, { lang, theme });
  return result.tokens;
}
